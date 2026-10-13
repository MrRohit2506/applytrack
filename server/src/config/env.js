import "dotenv/config";
import { z } from "zod";
import { databaseNameFromUri } from "../utils/mongoUri.js";

const secret = (name) =>
  z
    .string({ required_error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters`)
    .refine((v) => !v.startsWith("CHANGE_ME"), `${name} still has the placeholder value`);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z
    .string({ required_error: "MONGODB_URI is required" })
    .refine((v) => /^mongodb(\+srv)?:\/\//.test(v), "must start with mongodb:// or mongodb+srv://"),
  JWT_SECRET: secret("JWT_SECRET"),
  CSRF_SECRET: secret("CSRF_SECRET"),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(24 * 30).default(168),
  CLIENT_ORIGIN: z
    .string({ required_error: "CLIENT_ORIGIN is required" })
    .transform((s) => s.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean))
    .refine((a) => a.length > 0, "CLIENT_ORIGIN must contain at least one origin"),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_SECURE: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  COOKIE_DOMAIN: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  REMINDER_WINDOW_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  IMPORT_MAX_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(1024 * 1024),
  IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(10000).default(1000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  LOGIN_FAILURE_LIMIT: z.coerce.number().int().positive().default(10),
});

function fail(lines) {
  // Messages never contain the offending VALUES (only names and rules), so secrets cannot leak through them.
  throw new Error(`Invalid environment configuration (see server/.env.example):\n${lines.join("\n")}`);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const RESERVED_DATABASES = new Set(["test", "admin", "local", "config"]);

/**
 * Validates a set of environment variables. Throws on anything unsafe or missing; returns the frozen config
 * plus non-fatal `warnings`. Exported so the rules can be tested with arbitrary inputs.
 */
export function parseEnv(source = process.env) {
  // Treat empty strings (e.g. "COOKIE_DOMAIN=") as unset.
  const raw = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail(parsed.error.issues.map((i) => ` - ${i.path.join(".") || "env"}: ${i.message}`));

  const cfg = parsed.data;
  const isProd = cfg.NODE_ENV === "production";
  const cookieSecure = cfg.COOKIE_SECURE ?? isProd;
  const databaseName = databaseNameFromUri(cfg.MONGODB_URI);

  const problems = [];
  const warnings = [];

  if (cfg.COOKIE_SAMESITE === "none" && !cookieSecure) problems.push(" - COOKIE_SAMESITE=none requires secure cookies (COOKIE_SECURE=true).");
  if (isProd && !cookieSecure) problems.push(" - COOKIE_SECURE must not be false in production.");
  if (cfg.CLIENT_ORIGIN.includes("*")) problems.push(" - CLIENT_ORIGIN must list explicit origins; '*' is not allowed with credentials.");
  if (cfg.JWT_SECRET === cfg.CSRF_SECRET) problems.push(" - JWT_SECRET and CSRF_SECRET must be different.");

  for (const origin of cfg.CLIENT_ORIGIN.filter((o) => o !== "*")) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      problems.push(" - CLIENT_ORIGIN contains a value that is not a valid origin (expected e.g. https://app.example.com).");
      continue;
    }
    if (url.pathname !== "/" ) problems.push(" - CLIENT_ORIGIN entries must be bare origins without a path.");
    if (isProd && url.protocol !== "https:" && !LOCAL_HOSTS.has(url.hostname)) {
      problems.push(" - CLIENT_ORIGIN must use https:// in production.");
    }
    if (isProd && LOCAL_HOSTS.has(url.hostname)) warnings.push("CLIENT_ORIGIN contains a localhost origin in production.");
  }

  // A MongoDB URI without a database name silently uses the default "test" database.
  if (isProd && (!databaseName || RESERVED_DATABASES.has(databaseName.toLowerCase()))) {
    problems.push(" - MONGODB_URI must name the application database explicitly (e.g. .../applytrack) in production; an empty name falls back to MongoDB's default 'test' database.");
  } else if (!databaseName) {
    warnings.push("MONGODB_URI has no database name: MongoDB will use its default 'test' database.");
  }

  if (isProd && cfg.TRUST_PROXY === 0) {
    warnings.push("TRUST_PROXY=0 in production: behind a hosting proxy every client would share one rate-limit bucket. Set it to the number of proxies in front of the app.");
  }
  if (isProd && cfg.BCRYPT_ROUNDS < 10) warnings.push("BCRYPT_ROUNDS is below 10 in production.");

  if (problems.length) fail(problems);

  return Object.freeze({
    ...cfg,
    cookieSecure,
    databaseName,
    warnings: Object.freeze(warnings),
    sessionTtlMs: Math.round(cfg.SESSION_TTL_HOURS * 3600 * 1000),
    sessionTtlSeconds: Math.round(cfg.SESSION_TTL_HOURS * 3600),
  });
}

export const env = parseEnv();
