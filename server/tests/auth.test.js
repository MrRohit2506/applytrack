import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";

const ORIGIN = "http://localhost:5173";
const valid = { name: "Ada Lovelace", email: "ada@example.com", password: "Sup3rSecret!" };

let mongo;
let app;

beforeAll(async () => {
  let uri = process.env.TEST_MONGODB_URI;
  if (uri) {
    const dbName = new URL(uri).pathname.replace(/^\//, "");
    if (!/test/i.test(dbName)) throw new Error("TEST_MONGODB_URI database name must contain 'test'.");
  } else {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri("applytrack_test");
  }
  await connectDB(uri);
  await User.init();
  app = createApp();
});

afterAll(async () => {
  await disconnectDB();
  await mongo?.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

/** A browser-like agent (keeps cookies) plus a valid CSRF token for it. */
async function session(appInstance = app) {
  const agent = request.agent(appInstance);
  const res = await agent.get("/api/auth/csrf").expect(200);
  return { agent, token: res.body.data.csrfToken };
}
const post = (s, path, body) => s.agent.post(path).set("X-CSRF-Token", s.token).send(body);
const sessionCookie = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("applytrack_session="));

describe("health", () => {
  it("reports status without internals", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.data).toMatchObject({ status: "ok", database: "connected" });
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb:|secret|27017/i);
  });
});

describe("POST /api/auth/register", () => {
  it("creates a user, returns 201, signs in with an HttpOnly cookie, and hides the hash", async () => {
    const s = await session();
    const res = await post(s, "/api/auth/register", valid).expect(201);

    expect(res.body.data.user).toMatchObject({ name: valid.name, email: valid.email });
    expect(res.body.data.user.id).toBeTruthy();
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/passwordHash|tokenVersion|\$2[aby]\$|Sup3rSecret/);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api/);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("stores a bcrypt hash, never the plaintext password", async () => {
    const s = await session();
    await post(s, "/api/auth/register", valid).expect(201);
    const stored = await User.findOne({ email: valid.email }).select("+passwordHash");
    expect(stored.passwordHash).not.toBe(valid.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(valid.password, stored.passwordHash)).toBe(true);
  });

  it("normalises email (trim + lowercase)", async () => {
    const s = await session();
    const res = await post(s, "/api/auth/register", { ...valid, email: "  ADA@Example.COM " }).expect(201);
    expect(res.body.data.user.email).toBe("ada@example.com");
  });

  it("rejects invalid fields with field-level errors and creates nothing", async () => {
    const s = await session();
    const res = await post(s, "/api/auth/register", { name: "", email: "nope", password: "short" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.fieldErrors).sort()).toEqual(["email", "name", "password"]);
    expect(await User.countDocuments()).toBe(0);
  });

  it("rejects weak passwords (no number) and over-long names", async () => {
    const s = await session();
    const a = await post(s, "/api/auth/register", { ...valid, password: "onlyletters" }).expect(400);
    expect(a.body.error.fieldErrors.password).toMatch(/number/i);
    const b = await post(s, "/api/auth/register", { ...valid, name: "x".repeat(81) }).expect(400);
    expect(b.body.error.fieldErrors.name).toBeTruthy();
  });

  it("returns 409 for a duplicate email (case-insensitive)", async () => {
    const s = await session();
    await post(s, "/api/auth/register", valid).expect(201);
    const s2 = await session();
    const res = await post(s2, "/api/auth/register", { ...valid, email: "ADA@example.com" }).expect(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
    expect(await User.countDocuments()).toBe(1);
  });

  it("returns 400 for malformed JSON", async () => {
    const s = await session();
    const res = await s.agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", s.token)
      .set("Content-Type", "application/json")
      .send("{bad json")
      .expect(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("returns 413 for oversized bodies", async () => {
    const s = await session();
    await post(s, "/api/auth/register", { ...valid, name: "x".repeat(20000) }).expect(413);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    const s = await session();
    await post(s, "/api/auth/register", valid).expect(201);
  });

  it("logs in with valid credentials and sets the cookie", async () => {
    const s = await session();
    const res = await post(s, "/api/auth/login", { email: "ADA@example.com", password: valid.password }).expect(200);
    expect(res.body.data.user.email).toBe(valid.email);
    expect(sessionCookie(res)).toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("returns the same generic 401 for a wrong password and an unknown email", async () => {
    const s = await session();
    const wrong = await post(s, "/api/auth/login", { email: valid.email, password: "WrongPass123" }).expect(401);
    const unknown = await post(s, "/api/auth/login", { email: "ghost@example.com", password: "WrongPass123" }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(sessionCookie(wrong)).toBeUndefined();
  });

  it("rejects malformed login input with 400", async () => {
    const s = await session();
    await post(s, "/api/auth/login", { email: "bad" }).expect(400);
  });
});

describe("GET /api/auth/me, session persistence and logout", () => {
  it("returns 401 without authentication", async () => {
    const res = await request(app).get("/api/auth/me").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a forged / tampered session cookie", async () => {
    await request(app).get("/api/auth/me").set("Cookie", "applytrack_session=not.a.jwt").expect(401);
  });

  it("returns the safe profile while authenticated and persists across requests (page refresh)", async () => {
    const s = await session();
    await post(s, "/api/auth/register", valid).expect(201);
    const res = await s.agent.get("/api/auth/me").expect(200);
    expect(res.body.data.user.email).toBe(valid.email);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion/);
    // A fresh request carrying the same cookie jar models a browser refresh.
    await s.agent.get("/api/auth/me").expect(200);
  });

  it("logout clears the cookie and revokes the session, even if the old cookie is replayed", async () => {
    const s = await session();
    const reg = await post(s, "/api/auth/register", valid).expect(201);
    const oldCookie = sessionCookie(reg).split(";")[0];

    const out = await post(s, "/api/auth/logout", {}).expect(200);
    expect(sessionCookie(out)).toMatch(/applytrack_session=;/);

    await s.agent.get("/api/auth/me").expect(401); // cookie cleared in the jar
    await request(app).get("/api/auth/me").set("Cookie", oldCookie).expect(401); // replayed token revoked
  });

  it("logout without a session still succeeds", async () => {
    const s = await session();
    await post(s, "/api/auth/logout", {}).expect(200);
  });
});

describe("CSRF protection", () => {
  it("rejects unsafe requests without a token", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: valid.email, password: "x" }).expect(403);
    expect(res.body.error.code).toBe("CSRF_INVALID");
  });

  it("rejects an incorrect token", async () => {
    const s = await session();
    await s.agent.post("/api/auth/login").set("X-CSRF-Token", "bogus").send({ email: valid.email, password: "x" }).expect(403);
  });

  it("rejects a valid token sent from a disallowed Origin", async () => {
    const s = await session();
    const res = await s.agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", s.token)
      .set("Origin", "https://evil.example")
      .send(valid)
      .expect(403);
    expect(res.body.error.code).toBe("CSRF_INVALID");
    expect(await User.countDocuments()).toBe(0);
  });

  it("accepts a valid token from the allowed Origin", async () => {
    const s = await session();
    await s.agent.post("/api/auth/register").set("X-CSRF-Token", s.token).set("Origin", ORIGIN).send(valid).expect(201);
  });
});

describe("CORS", () => {
  const preflight = (origin) =>
    request(app)
      .options("/api/auth/login")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token");

  it("allows the configured origin with credentials (no wildcard)", async () => {
    const res = await preflight(ORIGIN).expect(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant CORS to other origins", async () => {
    const res = await preflight("https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  it("returns 429 after too many auth attempts", async () => {
    const limited = createApp({ authRateLimitMax: 3 });
    const s = await session(limited);
    const creds = { email: valid.email, password: "WrongPass123" };
    for (let i = 0; i < 3; i++) await post(s, "/api/auth/login", creds).expect(401);
    const res = await post(s, "/api/auth/login", creds).expect(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("unknown routes", () => {
  it("returns a JSON 404", async () => {
    const res = await request(app).get("/api/nope").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
