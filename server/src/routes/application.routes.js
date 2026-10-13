import express, { Router } from "express";
import {
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
} from "../controllers/application.controller.js";
import { env } from "../config/env.js";
import { exportApplications, importApplications } from "../controllers/applicationCsv.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { importQuerySchema } from "../validation/analytics.schemas.js";
import {
  createApplicationSchema,
  listApplicationsQuerySchema,
  updateApplicationSchema,
} from "../validation/application.schemas.js";

export function createApplicationRouter() {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store"); // private data must not be cached
    next();
  });
  router.use(requireAuth); // every endpoint requires a valid session; sets req.user

  router.get("/", validate(listApplicationsQuerySchema, "query"), listApplications);
  router.post("/", validate(createApplicationSchema), createApplication);
  // Fixed paths must be declared before "/:id".
  router.get("/export", exportApplications);
  router.post(
    "/import",
    // Route-level text parser: only CSV/plain text, hard byte limit (413 beyond it). Runs after requireAuth.
    express.text({ type: ["text/csv", "text/plain"], limit: env.IMPORT_MAX_BYTES }),
    validate(importQuerySchema, "query"),
    importApplications,
  );

  router.get("/:id", validateObjectId, getApplication);
  router.patch("/:id", validateObjectId, validate(updateApplicationSchema), updateApplication);
  router.delete("/:id", validateObjectId, deleteApplication);

  return router;
}
