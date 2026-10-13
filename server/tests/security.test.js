import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { Application } from "../src/models/Application.js";
import { User } from "../src/models/User.js";
import { anonymous, http, newUser, resetCollections, startTestDb, stopTestDb, validApp } from "./helpers.js";

const JWT_SECRET = process.env.JWT_SECRET; // set by tests/env.setup.js
const GHOST = "507f1f77bcf86cd799439011";
let app;
let alice;
let A;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
});
afterAll(stopTestDb);
beforeEach(async () => {
  await resetCollections();
  alice = await newUser(app, "alice@example.com");
  A = http(alice);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_IN_TEST;
});

const sessionCookie = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("applytrack_session="));
const asCookie = (token) => `applytrack_session=${token}`;

describe("HTTP hardening", () => {
  it("sends security headers, hides the framework and tags every response with a request id", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.headers["x-powered-by"]).toBe(undefined);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["content-security-policy"]).toBeTruthy();
    expect(res.headers["referrer-policy"]).toBeTruthy();
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ignores a client-supplied request id", async () => {
    const res = await request(app).get("/api/health").set("X-Request-Id", "attacker-controlled");
    expect(res.headers["x-request-id"]).not.toBe("attacker-controlled");
  });

  it("marks private API responses as non-cacheable", async () => {
    for (const path of ["/api/auth/me", "/api/applications", "/api/analytics/overview", "/api/reminders", "/api/applications/export"]) {
      const res = await A.get(path).expect(200);
      expect(res.headers["cache-control"]).toMatch(/no-store/);
    }
  });

  it("health exposes only coarse status", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(Object.keys(res.body.data).sort()).toEqual(["database", "status", "uptimeSeconds"]);
  });

  it("maps unsupported encodings and charsets to 415 instead of a 500", async () => {
    const enc = await request(app).post("/api/auth/login").set("Content-Type", "application/json").set("Content-Encoding", "unknown-enc").send("{}");
    expect(enc.status).toBe(415);
    expect(enc.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    const cs = await request(app).post("/api/auth/login").set("Content-Type", "application/json; charset=foo").send("{}");
    expect(cs.status).toBe(415);
    expect(JSON.stringify([enc.body, cs.body])).not.toMatch(/stack|node_modules|at /);
  });
});

describe("authentication: token forgery and session lifecycle", () => {
  const me = (token) => request(app).get("/api/auth/me").set("Cookie", asCookie(token));

  it("rejects a token signed with the wrong secret", async () => {
    await me(jwt.sign({ tv: 0 }, "x".repeat(40), { subject: alice.id, algorithm: "HS256" })).expect(401);
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: alice.id, tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    await me(token).expect(401);
  });

  it("rejects an expired token and clears the cookie", async () => {
    const res = await me(jwt.sign({ tv: 0 }, JWT_SECRET, { subject: alice.id, algorithm: "HS256", expiresIn: -10 })).expect(401);
    expect(sessionCookie(res)).toMatch(/applytrack_session=;/);
  });

  it("rejects a token with a stale tokenVersion, a malformed subject, or for a deleted user", async () => {
    await me(jwt.sign({ tv: 5 }, JWT_SECRET, { subject: alice.id, algorithm: "HS256" })).expect(401);
    await me(jwt.sign({ tv: 0 }, JWT_SECRET, { subject: "not-an-object-id", algorithm: "HS256" })).expect(401);
    const valid = jwt.sign({ tv: 0 }, JWT_SECRET, { subject: alice.id, algorithm: "HS256" });
    await me(valid).expect(200);
    await User.deleteOne({ _id: alice.id });
    await me(valid).expect(401);
  });

  it("session cookie and CSRF cookie are HttpOnly, path-scoped, SameSite and time-limited", async () => {
    const fresh = await anonymous(app);
    const res = await http(fresh).post("/api/auth/register", { name: "N", email: "n@example.com", password: "Sup3rSecret!" }).expect(201);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Expires=|Max-Age=/i);
    const csrf = await request(app).get("/api/auth/csrf");
    expect((csrf.headers["set-cookie"] || [])[0]).toMatch(/HttpOnly/i);
  });

  it("never returns the password, its hash, or the session token in a response body", async () => {
    const fresh = await anonymous(app);
    const res = await http(fresh).post("/api/auth/register", { name: "N", email: "n2@example.com", password: "Sup3rSecret!" }).expect(201);
    const tokenValue = sessionCookie(res).split(";")[0].split("=")[1];
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(tokenValue);
    expect(body).not.toMatch(/Sup3rSecret|passwordHash|\$2[aby]\$|tokenVersion/);
  });

  it("ignores extra registration fields (no mass assignment of roles, ids or token versions)", async () => {
    const fresh = await anonymous(app);
    const res = await http(fresh).post("/api/auth/register", { name: "N", email: "mass@example.com", password: "Sup3rSecret!", role: "admin", tokenVersion: 99, _id: GHOST, isAdmin: true }).expect(201);
    expect(res.body.data.user.id).not.toBe(GHOST);
    const stored = await User.findOne({ email: "mass@example.com" }).select("+tokenVersion").lean();
    expect(stored.tokenVersion).toBe(0);
    expect(stored).not.toHaveProperty("role");
    expect(stored).not.toHaveProperty("isAdmin");
  });

  it("a CSRF token only works with the cookie it was issued for", async () => {
    const other = await anonymous(app);
    await alice.agent.post("/api/applications").set("X-CSRF-Token", other.token).send(validApp).expect(403);
  });
});

describe("NoSQL operator injection", () => {
  it.each([
    [{ email: { $ne: "" }, password: { $ne: "" } }],
    [{ email: "a@b.co", password: { $gt: "" } }],
    [{ email: { $regex: ".*" }, password: "x" }],
  ])("login rejects operator payload %j without issuing a cookie", async (payload) => {
    const anon = http(await anonymous(app));
    const res = await anon.post("/api/auth/login", payload).expect(400);
    expect(sessionCookie(res)).toBe(undefined);
  });

  it("registration and application bodies reject operator objects", async () => {
    const anon = http(await anonymous(app));
    await anon.post("/api/auth/register", { name: { $ne: null }, email: "x@y.co", password: "Sup3rSecret!" }).expect(400);
    await A.post("/api/applications", { ...validApp, company: { $ne: null } }).expect(400);
    const created = await A.post("/api/applications", validApp).expect(201);
    await A.patch(`/api/applications/${created.body.data.application.id}`, { status: { $ne: "Applied" } }).expect(400);
    expect(await Application.countDocuments({ userId: alice.id })).toBe(1);
  });

  it.each([
    ["/api/applications?search[$ne]=x"],
    ["/api/applications?status[$in][]=Offer"],
    ["/api/applications?page[$gt]=0"],
    ["/api/applications?applicationDateFrom[$lt]=2026-01-01"],
    ["/api/analytics/overview?today[$ne]=x"],
    ["/api/reminders?windowDays[$gt]=1"],
  ])("query string %s is rejected", async (url) => {
    await A.get(url).expect(400);
  });

  it("rejects an operator object smuggled in as an id", async () => {
    await A.get(`/api/applications/${encodeURIComponent('{"$ne":null}')}`).expect(400);
  });
});

describe("output handling", () => {
  it("returns script-like content as inert JSON data with nosniff", async () => {
    const xss = { company: "<img src=x onerror=alert(1)>", role: "<script>alert(1)</script>", applicationDate: "2026-03-05", notes: "</script><svg onload=alert(1)>" };
    await A.post("/api/applications", xss).expect(201);
    const res = await A.get("/api/applications").expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body.data.applications[0]).toMatchObject({ company: xss.company, role: xss.role, notes: xss.notes });
    const exp = await A.get("/api/applications/export").expect(200);
    expect(exp.headers["content-disposition"]).toMatch(/^attachment/);
  });
});

describe("every private endpoint rejects anonymous callers", () => {
  it("returns 401 for all of them and writes nothing", async () => {
    const X = http(await anonymous(app));
    const csv = (p) => X.agent.post(p).set("X-CSRF-Token", X.token).set("Content-Type", "text/csv").send("company,role,applicationDate\nA,B,2026-01-01\n");
    const results = [
      await X.get("/api/auth/me"),
      await X.get("/api/applications"),
      await X.post("/api/applications", validApp),
      await X.get(`/api/applications/${GHOST}`),
      await X.patch(`/api/applications/${GHOST}`, { status: "Offer" }),
      await X.del(`/api/applications/${GHOST}`),
      await X.get("/api/applications/export"),
      await csv("/api/applications/import?commit=true"),
      await X.get("/api/analytics/overview"),
      await X.get("/api/reminders"),
    ];
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(401));
    expect(await Application.countDocuments({ userId: { $ne: alice.id } })).toBe(0);
  });
});

describe("brute-force protection", () => {
  it("throttles failed logins per ACCOUNT even across 'different' clients, but not other accounts", async () => {
    const limited = createApp({ loginFailureLimit: 3, authRateLimitMax: 1000 });
    const u = await newUser(limited, "victim@example.com");
    const bad = (email) => http(u).post("/api/auth/login", { email, password: "WrongPass123" });
    for (let i = 0; i < 3; i++) await bad("victim@example.com").expect(401);
    const blocked = await bad("victim@example.com").expect(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    await bad("someone-else@example.com").expect(401); // a different account is unaffected
  });

  it("does not count successful logins", async () => {
    const limited = createApp({ loginFailureLimit: 3, authRateLimitMax: 1000 });
    const u = await newUser(limited, "busy@example.com");
    for (let i = 0; i < 5; i++) await http(u).post("/api/auth/login", { email: "busy@example.com", password: "Sup3rSecret!" }).expect(200);
    for (let i = 0; i < 3; i++) await http(u).post("/api/auth/login", { email: "busy@example.com", password: "nope-nope-1" }).expect(401);
    await http(u).post("/api/auth/login", { email: "busy@example.com", password: "nope-nope-1" }).expect(429);
  });

  it("gives the same generic message for unknown and known accounts when throttled", async () => {
    const limited = createApp({ loginFailureLimit: 1, authRateLimitMax: 1000 });
    const u = await newUser(limited, "known@example.com");
    const a = http(u);
    await a.post("/api/auth/login", { email: "known@example.com", password: "nope-nope-1" }).expect(401);
    await a.post("/api/auth/login", { email: "ghost@example.com", password: "nope-nope-1" }).expect(401);
    const known = await a.post("/api/auth/login", { email: "known@example.com", password: "nope-nope-1" }).expect(429);
    const ghost = await a.post("/api/auth/login", { email: "ghost@example.com", password: "nope-nope-1" }).expect(429);
    expect(known.body).toEqual(ghost.body);
  });
});

describe("error handling and logging", () => {
  it("returns a generic 500 with a request id and never leaks internals or secrets, in the body or the logs", async () => {
    process.env.LOG_IN_TEST = "1";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(User, "findOne").mockReturnValue({
      select: () => Promise.reject(new Error("connect ECONNREFUSED mongodb+srv://admin:Hunter2@cluster0.x.mongodb.net/db password=Hunter2")),
    });
    const anon = http(await anonymous(app));
    const res = await anon.post("/api/auth/login", { email: "a@b.co", password: "Sup3rSecret!" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({ code: "INTERNAL_ERROR", message: "Something went wrong. Please try again later.", requestId: res.headers["x-request-id"] });
    expect(JSON.stringify(res.body)).not.toMatch(/Hunter2|mongodb|ECONNREFUSED|stack|node_modules/);
    const output = logged.mock.calls.flat().join(" ");
    expect(output).toContain("unhandled error");
    expect(output).toContain("[redacted]");
    expect(output).not.toMatch(/Hunter2|mongodb\+srv|Sup3rSecret/);
  });

  it("uses one error shape across statuses", async () => {
    const results = [await request(app).get("/api/nope"), await request(app).get("/api/auth/me"), await A.get("/api/applications?limit=0")];
    for (const r of results) {
      expect(Object.keys(r.body)).toEqual(["error"]);
      expect(typeof r.body.error.code).toBe("string");
      expect(typeof r.body.error.message).toBe("string");
    }
    expect(results.map((r) => r.status)).toEqual([404, 401, 400]);
  });
});
