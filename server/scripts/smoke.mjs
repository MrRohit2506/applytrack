// Read-only post-deployment smoke test: no accounts are created and no data is written.
//   node scripts/smoke.mjs <apiBaseUrl> [frontendOrigin]
//   e.g. node scripts/smoke.mjs https://applytrack-api.onrender.com https://your-app.vercel.app
// It verifies server-side behaviour only. Whether a BROWSER accepts the cookies in your topology must still be
// tested by hand (sign in from the deployed frontend, refresh, sign out).
const [, , apiArg, originArg] = process.argv;
if (!apiArg) {
  console.error("Usage: node scripts/smoke.mjs <apiBaseUrl> [frontendOrigin]");
  process.exit(2);
}
const api = apiArg.replace(/\/+$/, "");
const https = api.startsWith("https://");
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const call = async (path, init = {}) => {
  try {
    return await fetch(`${api}${path}`, { redirect: "manual", signal: AbortSignal.timeout(60000), ...init });
  } catch (err) {
    return { networkError: err.message };
  }
};

const health = await call("/api/health");
if (health.networkError) {
  console.error(`FAIL  API unreachable: ${health.networkError}`);
  process.exit(1);
}
const hbody = await health.json().catch(() => null);
check("GET /api/health is 200 and the database is connected", health.status === 200 && hbody?.data?.database === "connected", `status ${health.status}`);
check("health reveals only coarse status", hbody?.data && Object.keys(hbody.data).sort().join() === "database,status,uptimeSeconds");
check("x-content-type-options: nosniff", health.headers.get("x-content-type-options") === "nosniff");
check("framework header x-powered-by is absent", !health.headers.get("x-powered-by"));
check("x-request-id is present", Boolean(health.headers.get("x-request-id")));
if (https) check("strict-transport-security is present (https)", Boolean(health.headers.get("strict-transport-security")));

for (const path of ["/api/auth/me", "/api/applications", "/api/analytics/overview", "/api/reminders", "/api/applications/export"]) {
  const r = await call(path);
  check(`GET ${path} without a session is 401`, r.status === 401, `status ${r.status}`);
}
const notFound = await call("/api/definitely-not-here");
check("unknown API route is a JSON 404", notFound.status === 404 && (notFound.headers.get("content-type") || "").includes("json"));

const csrf = await call("/api/auth/csrf");
const cookies = csrf.headers.getSetCookie?.() ?? [];
const csrfCookie = cookies.find((c) => c.startsWith("applytrack_csrf=")) || "";
check("GET /api/auth/csrf issues a token", csrf.status === 200 && Boolean((await csrf.json().catch(() => null))?.data?.csrfToken));
check("csrf cookie is HttpOnly, Path=/api", /HttpOnly/i.test(csrfCookie) && /Path=\/api/i.test(csrfCookie), csrfCookie ? "" : "no cookie");
if (https) check("csrf cookie is Secure (https)", /;\s*Secure/i.test(csrfCookie));
console.log(`INFO  cookie SameSite attribute: ${(/SameSite=(\w+)/i.exec(csrfCookie) || [])[1] ?? "(none)"}`);

const noToken = await call("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "smoke@example.invalid", password: "x" }) });
check("POST without a CSRF token is rejected (403)", noToken.status === 403, `status ${noToken.status}`);

if (originArg) {
  const origin = originArg.replace(/\/+$/, "");
  const pre = (o) => call("/api/auth/login", { method: "OPTIONS", headers: { Origin: o, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-csrf-token" } });
  const good = await pre(origin);
  check(`CORS allows the frontend origin ${origin} with credentials`, good.headers.get("access-control-allow-origin") === origin && good.headers.get("access-control-allow-credentials") === "true");
  const evil = await pre("https://evil.example");
  check("CORS does not allow an unknown origin", !evil.headers.get("access-control-allow-origin"));
  const wildcard = good.headers.get("access-control-allow-origin") === "*";
  check("CORS is not a wildcard", !wildcard);
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
