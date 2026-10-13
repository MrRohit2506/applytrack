import { env } from "../config/env.js";

export const SESSION_COOKIE = "applytrack_session";
export const CSRF_COOKIE = "applytrack_csrf";

/** Shared cookie attributes. Path is scoped to the API; cookies are never readable from JS. */
export function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    path: "/api",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...baseCookieOptions(), maxAge: env.sessionTtlMs });
}

export function clearSessionCookie(res) {
  // Options must match those used when setting the cookie (except maxAge/expires).
  res.clearCookie(SESSION_COOKIE, baseCookieOptions());
}
