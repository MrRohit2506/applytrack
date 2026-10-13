import { Router } from "express";
import { listReminders } from "../controllers/analytics.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { remindersQuerySchema } from "../validation/analytics.schemas.js";

export function createRemindersRouter() {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireAuth);
  router.get("/", validate(remindersQuerySchema, "query"), listReminders);
  return router;
}
