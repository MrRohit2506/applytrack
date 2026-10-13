import mongoose from "mongoose";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { SESSION_COOKIE, clearSessionCookie } from "../utils/cookies.js";
import { verifySession } from "../utils/token.js";

const unauthenticated = () => new AppError(401, "UNAUTHENTICATED", "Authentication required.");

/** Verifies the session cookie on the server: signature, expiry, user existence, tokenVersion. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw unauthenticated();

  let payload;
  try {
    payload = verifySession(token);
  } catch {
    clearSessionCookie(res);
    throw unauthenticated();
  }

  if (!mongoose.isValidObjectId(payload.sub)) {
    clearSessionCookie(res);
    throw unauthenticated();
  }

  const user = await User.findById(payload.sub).select("+tokenVersion");
  if (!user || user.tokenVersion !== payload.tv) {
    clearSessionCookie(res); // revoked (logged out) or deleted user
    throw unauthenticated();
  }

  req.user = user;
  next();
});
