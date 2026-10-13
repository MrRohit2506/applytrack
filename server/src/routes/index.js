import { Router } from "express";
import { env } from "../config/env.js";
import { csrfProtection } from "../middleware/csrf.js";
import { createAuthLimiter, createLoginFailureLimiter } from "../middleware/rateLimiters.js";
import { createAnalyticsRouter } from "./analytics.routes.js";
import { createApplicationRouter } from "./application.routes.js";
import { createRemindersRouter } from "./reminders.routes.js";
import { createAuthRouter } from "./auth.routes.js";
import healthRoutes from "./health.routes.js";

export function createApiRouter({ authRateLimitMax = env.AUTH_RATE_LIMIT_MAX, loginFailureLimit = env.LOGIN_FAILURE_LIMIT } = {}) {
  const router = Router();
  const authLimiter = createAuthLimiter({
    limit: authRateLimitMax,
    windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
  });

  const loginFailureLimiter = createLoginFailureLimiter({
    limit: loginFailureLimit,
    windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
  });

  router.use(healthRoutes);
  router.use(csrfProtection); // applies to every unsafe (POST/PUT/PATCH/DELETE) API request
  router.use("/auth", createAuthRouter({ authLimiter, loginFailureLimiter }));
  router.use("/applications", createApplicationRouter());
  router.use("/analytics", createAnalyticsRouter());
  router.use("/reminders", createRemindersRouter());
  return router;
}
