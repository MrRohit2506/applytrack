import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { createApiLimiter } from "./middleware/rateLimiters.js";
import { createApiRouter } from "./routes/index.js";

const corsOptions = {
  // Explicit allow-list; never "*" with credentials.
  origin: (origin, cb) => cb(null, Boolean(origin) && env.CLIENT_ORIGIN.includes(origin)),
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "X-CSRF-Token"],
  exposedHeaders: ["Content-Disposition", "X-Record-Count", "X-Request-Id"],
  maxAge: 600,
};

export function createApp(options = {}) {
  const app = express();
  app.disable("x-powered-by");
  // "simple" (Node querystring) parser: nested keys like search[$ne]=x stay flat strings that the strict
  // query schemas reject as unknown parameters, instead of becoming objects (defence in depth against NoSQL operators).
  app.set("query parser", "simple");
  if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

  app.use(requestContext);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.use("/api", createApiLimiter({ limit: env.API_RATE_LIMIT_MAX }), createApiRouter(options));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
