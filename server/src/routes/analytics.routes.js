import { Router } from "express";
import { getOverview } from "../controllers/analytics.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { overviewQuerySchema } from "../validation/analytics.schemas.js";

export function createAnalyticsRouter() {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireAuth);
  router.get("/overview", validate(overviewQuerySchema, "query"), getOverview);
  return router;
}
