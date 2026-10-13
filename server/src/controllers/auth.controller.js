import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from "../utils/cookies.js";
import { signSession, verifySession } from "../utils/token.js";
import { issueCsrfToken } from "../middleware/csrf.js";

// Used to burn equivalent bcrypt time when the email is unknown (reduces timing-based enumeration).
let dummyHash;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("applytrack-dummy-password-1", env.BCRYPT_ROUNDS));

export const csrfToken = (req, res) => {
  res.json({ data: { csrfToken: issueCsrfToken(req, res) } });
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  let user;
  try {
    user = await User.create({ name, email, passwordHash });
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.", {
        email: "An account with this email already exists.",
      });
    }
    throw err;
  }

  setSessionCookie(res, signSession(user)); // registration signs the user in
  res.status(201).json({ data: { user: user.toJSON() } });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+passwordHash +tokenVersion");

  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : await getDummyHash());
  if (!user || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  setSessionCookie(res, signSession(user));
  res.json({ data: { user: user.toJSON() } });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  let payload = null;
  if (token) {
    try {
      payload = verifySession(token);
    } catch {
      // Invalid/expired token: nothing to revoke. Still clear the cookie below.
    }
  }
  if (payload) {
    // Revoke: bump tokenVersion so this (and any other copy of the) JWT stops working.
    await User.updateOne({ _id: payload.sub, tokenVersion: payload.tv }, { $inc: { tokenVersion: 1 } });
  }
  clearSessionCookie(res);
  res.json({ data: { message: "Logged out." } });
});

export const me = (req, res) => {
  res.json({ data: { user: req.user.toJSON() } });
};
