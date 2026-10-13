import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { Application } from "./models/Application.js";
import { User } from "./models/User.js";
import { errorFields, logger } from "./utils/logger.js";

// Last-resort handlers: log (redacted) and exit so the platform restarts a clean process.
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled promise rejection", errorFields(reason));
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.error("uncaught exception", errorFields(err));
  process.exit(1);
});

async function main() {
  for (const w of env.warnings) logger.warn(w);

  try {
    await connectDB(env.MONGODB_URI);
    await Promise.all([User.init(), Application.init()]); // indexes exist before serving traffic
    // Name only, never the URI: lets you confirm the intended database is in use.
    logger.info("MongoDB connected", { database: mongoose.connection.name });
  } catch (err) {
    logger.error("Failed to connect to MongoDB. Check MONGODB_URI, database user permissions and the Atlas network access list.", { errorName: err?.name ?? "Error" });
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  mongoose.connection.on("error", (err) => logger.error("MongoDB connection error", errorFields(err)));

  const server = createApp().listen(env.PORT, () => {
    logger.info("ApplyTrack API listening", { port: env.PORT, mode: env.NODE_ENV });
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    server.closeIdleConnections?.(); // do not wait on idle keep-alive sockets
    setTimeout(() => process.exit(1), 10000).unref(); // hard stop if a request (e.g. a long export) never finishes
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
