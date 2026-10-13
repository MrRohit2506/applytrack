// Validates the environment exactly as the server does, without connecting to anything or starting it.
// Prints a NON-SECRET summary. Usage: NODE_ENV=production node scripts/check-env.js  (or: npm run check:env)
try {
  const { env } = await import("../src/config/env.js");
  console.log("Environment OK");
  console.log(JSON.stringify({
    mode: env.NODE_ENV,
    port: env.PORT,
    database: env.databaseName || "(none: MongoDB default)",
    allowedOrigins: env.CLIENT_ORIGIN,
    cookie: { secure: env.cookieSecure, sameSite: env.COOKIE_SAMESITE, domain: env.COOKIE_DOMAIN ?? "(host-only)" },
    trustProxy: env.TRUST_PROXY,
    sessionHours: env.SESSION_TTL_HOURS,
    bcryptRounds: env.BCRYPT_ROUNDS,
    limits: { importBytes: env.IMPORT_MAX_BYTES, importRows: env.IMPORT_MAX_ROWS, authPerIp: env.AUTH_RATE_LIMIT_MAX, loginFailuresPerAccount: env.LOGIN_FAILURE_LIMIT, apiPerIp: env.API_RATE_LIMIT_MAX },
    reminderWindowDays: env.REMINDER_WINDOW_DAYS,
  }, null, 2));
  for (const w of env.warnings) console.warn(`WARNING: ${w}`);
} catch (err) {
  console.error(err.message); // validation messages never contain secret values
  process.exit(1);
}
