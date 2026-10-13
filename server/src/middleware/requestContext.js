import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";

/**
 * Gives every request an id (returned as X-Request-Id and included in 5xx bodies so a user report can be
 * matched to a log line) and logs one line per request: method, path WITHOUT the query string, status, duration.
 */
export function requestContext(req, res, next) {
  req.id = randomUUID(); // never trust a client-supplied id
  res.set("X-Request-Id", req.id);
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (req.path === "/api/health") return; // platform health checks are noisy
    logger.info("request", {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1000000n),
    });
  });
  next();
}
