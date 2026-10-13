import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { CSRF_COOKIE, baseCookieOptions } from "../utils/cookies.js";

/**
 * CSRF design: HMAC-signed double-submit.
 *  - A random nonce lives in an HttpOnly cookie.
 *  - The client obtains token = HMAC(CSRF_SECRET, nonce) from GET /api/auth/csrf (response body)
 *    and echoes it in the X-CSRF-Token header on unsafe requests.
 *  - A cross-site attacker can neither read the token (CORS blocks the response) nor forge it
 *    (needs CSRF_SECRET), so this also holds when frontend and API are on different sites.
 *  - Additionally, if a browser sends an Origin header it must be in CLIENT_ORIGIN.
 */
const NONCE_RE = /^[A-Za-z0-9_-]{43}$/;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const sign = (nonce) =>
  crypto.createHmac("sha256", env.CSRF_SECRET).update(nonce).digest("base64url");

export function issueCsrfToken(req, res) {
  let nonce = req.cookies?.[CSRF_COOKIE];
  if (!nonce || !NONCE_RE.test(nonce)) {
    nonce = crypto.randomBytes(32).toString("base64url");
    res.cookie(CSRF_COOKIE, nonce, { ...baseCookieOptions(), maxAge: 24 * 3600 * 1000 });
  }
  return sign(nonce);
}

const reject = (message) => new AppError(403, "CSRF_INVALID", message);

export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin && !env.CLIENT_ORIGIN.includes(origin)) return next(reject("Request origin is not allowed."));

  const nonce = req.cookies?.[CSRF_COOKIE];
  const token = req.get("x-csrf-token");
  if (!nonce || !NONCE_RE.test(nonce) || !token) return next(reject("Missing or invalid CSRF token."));

  const expected = Buffer.from(sign(nonce));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return next(reject("Missing or invalid CSRF token."));
  }
  next();
}
