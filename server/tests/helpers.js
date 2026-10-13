import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";
import { Application } from "../src/models/Application.js";
import { parseCalendarDate } from "../src/utils/dates.js";

let mongo;

/** Connects to an ISOLATED test database (in-memory, or TEST_MONGODB_URI whose name contains "test"). */
export async function startTestDb() {
  let uri = process.env.TEST_MONGODB_URI;
  if (uri) {
    const dbName = new URL(uri).pathname.replace(/^\//, "");
    if (!/test/i.test(dbName)) throw new Error("TEST_MONGODB_URI database name must contain 'test'.");
  } else {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri("applytrack_test");
  }
  await connectDB(uri);
  assertTestDatabase(); // the connected database itself must be a test database
  await User.init();
  await Application.init();
}

export async function stopTestDb() {
  await disconnectDB();
  await mongo?.stop();
}

/** Refuses to run destructive helpers against anything that is not clearly a test database. */
export function assertTestDatabase() {
  const name = mongoose.connection.name || "";
  if (!/test/i.test(name)) throw new Error(`Refusing to modify database "${name}": its name must contain "test".`);
}

export async function resetCollections() {
  assertTestDatabase();
  await Promise.all([User.deleteMany({}), Application.deleteMany({})]);
}

/** Registers a user through the real API and returns a cookie-keeping agent + CSRF token. */
export async function newUser(app, email) {
  const agent = request.agent(app);
  const csrf = await agent.get("/api/auth/csrf").expect(200);
  const token = csrf.body.data.csrfToken;
  const res = await agent
    .post("/api/auth/register")
    .set("X-CSRF-Token", token)
    .send({ name: "Test User", email, password: "Sup3rSecret!" })
    .expect(201);
  return { agent, token, id: res.body.data.user.id, email };
}

/** An agent with a CSRF token but NO session. */
export async function anonymous(app) {
  const agent = request.agent(app);
  const csrf = await agent.get("/api/auth/csrf").expect(200);
  return { agent, token: csrf.body.data.csrfToken };
}

export const http = (u) => ({
  get: (p) => u.agent.get(p),
  post: (p, body) => u.agent.post(p).set("X-CSRF-Token", u.token).send(body),
  patch: (p, body) => u.agent.patch(p).set("X-CSRF-Token", u.token).send(body),
  del: (p) => u.agent.delete(p).set("X-CSRF-Token", u.token),
});

/** Inserts applications directly (rows use "YYYY-MM-DD" strings). Insert order = _id order. */
export async function seed(userId, rows) {
  const docs = rows.map((r) => ({
    status: "Applied",
    ...r,
    userId,
    applicationDate: parseCalendarDate(r.applicationDate),
    deadline: r.deadline ? parseCalendarDate(r.deadline) : null,
  }));
  const out = [];
  for (const d of docs) out.push(await Application.create(d)); // sequential => increasing _id
  return out;
}

export const validApp = {
  company: "Acme Corp",
  role: "Frontend Engineer",
  applicationDate: "2026-03-05",
};
