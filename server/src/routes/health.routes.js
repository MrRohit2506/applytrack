import { Router } from "express";
import { isDbConnected } from "../config/db.js";

const router = Router();

// Reports coarse status only: no hostnames, versions, URIs or secrets.
router.get("/health", (_req, res) => {
  const up = isDbConnected();
  res.status(up ? 200 : 503).json({
    data: {
      status: up ? "ok" : "degraded",
      database: up ? "connected" : "disconnected",
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});

export default router;
