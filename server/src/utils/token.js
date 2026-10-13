import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Session JWT: subject = user id, `tv` = user's tokenVersion (bumped on logout to revoke). */
export function signSession(user) {
  return jwt.sign({ tv: user.tokenVersion ?? 0 }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: String(user._id),
    expiresIn: env.sessionTtlSeconds,
  });
}

/** Throws on bad signature, wrong algorithm, or expiry. */
export function verifySession(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
}
