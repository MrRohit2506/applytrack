import rateLimit from "express-rate-limit";
import { AppError } from "../utils/AppError.js";

const make = ({ windowMs, limit }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later.")),
  });

/** Strict limiter for credential endpoints (login/register). */
export const createAuthLimiter = ({ limit, windowMinutes }) =>
  make({ windowMs: windowMinutes * 60 * 1000, limit });

/** Broad limiter for the whole API. */
export const createApiLimiter = ({ limit = 1000 } = {}) => make({ windowMs: 15 * 60 * 1000, limit });

/**
 * Per-ACCOUNT brute-force limiter for login: counts only FAILED attempts (successful logins are skipped),
 * keyed by the normalised email, so many IPs guessing one account are throttled too. Trade-off: someone can
 * deliberately lock a known email out for the window; the generic message reveals nothing about the account.
 * Must run after request validation (the key is the normalised email).
 */
export const createLoginFailureLimiter = ({ limit, windowMinutes }) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `login:${req.body?.email ?? "unknown"}`,
    handler: (_req, _res, next) =>
      next(new AppError(429, "RATE_LIMITED", "Too many failed sign-in attempts. Please try again later.")),
  });
