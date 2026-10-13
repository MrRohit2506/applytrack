import { Router } from "express";
import { csrfToken, login, logout, me, register } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../validation/auth.schemas.js";

export function createAuthRouter({ authLimiter, loginFailureLimiter }) {
  const router = Router();

  // Auth responses must never be cached by browsers or proxies.
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/csrf", csrfToken);
  router.post("/register", authLimiter, validate(registerSchema), register);
  router.post("/login", authLimiter, validate(loginSchema), loginFailureLimiter, login);
  router.post("/logout", logout);
  router.get("/me", requireAuth, me);

  return router;
}
