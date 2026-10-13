// Minimal structured logger. Everything is passed through redact() so connection strings, JWTs and
// credential-looking key=value pairs can never reach the logs. Silent when NODE_ENV=test
// (set LOG_IN_TEST=1 to capture output in a test). Request bodies, cookies and query strings are never logged.
const URI_RE = /mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const KV_RE = /\b(password|passwd|secret|token|authorization|cookie|set-cookie)\b(\s*[=:]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi;

export function redact(value) {
  return String(value)
    .replace(URI_RE, "mongodb://[redacted]")
    .replace(JWT_RE, "[redacted-jwt]")
    .replace(KV_RE, (_m, key, sep) => `${key}${sep}[redacted]`);
}

export function errorFields(err) {
  return { errorName: err?.name ?? "Error", errorMessage: redact(err?.message ?? err), stack: redact(err?.stack ?? "") };
}

function write(level, message, fields = {}) {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TEST) return;
  const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? redact(v) : v]));
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (process.env.NODE_ENV === "production") {
    out(JSON.stringify({ level, time: new Date().toISOString(), msg: redact(message), ...clean }));
  } else {
    const extra = Object.keys(clean).length ? ` ${JSON.stringify(clean)}` : "";
    out(`[${level}] ${redact(message)}${extra}`);
  }
}

export const logger = {
  info: (m, f) => write("info", m, f),
  warn: (m, f) => write("warn", m, f),
  error: (m, f) => write("error", m, f),
};
