import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Application } from "../src/models/Application.js";
import { anonymous, http, newUser, resetCollections, seed, startTestDb, stopTestDb, validApp } from "./helpers.js";

const GHOST_ID = "507f1f77bcf86cd799439011"; // valid ObjectId that does not exist
let app;
let alice;
let bob;
let A; // http helpers for alice
let B;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
});
afterAll(stopTestDb);
beforeEach(async () => {
  await resetCollections();
  alice = await newUser(app, "alice@example.com");
  bob = await newUser(app, "bob@example.com");
  A = http(alice);
  B = http(bob);
});

const names = (res) => res.body.data.applications.map((a) => a.company);

describe("authentication required", () => {
  it("rejects every endpoint without a session (401)", async () => {
    const anon = await anonymous(app);
    const X = http(anon);
    await X.get("/api/applications").expect(401);
    await X.post("/api/applications", validApp).expect(401);
    await X.get(`/api/applications/${GHOST_ID}`).expect(401);
    await X.patch(`/api/applications/${GHOST_ID}`, { status: "Offer" }).expect(401);
    await X.del(`/api/applications/${GHOST_ID}`).expect(401);
    expect(await Application.countDocuments()).toBe(0);
  });

  it("still enforces CSRF on unsafe application requests", async () => {
    await alice.agent.post("/api/applications").send(validApp).expect(403);
    await alice.agent.delete(`/api/applications/${GHOST_ID}`).expect(403);
  });
});

describe("POST /api/applications", () => {
  it("creates an application owned by the session user, with defaults", async () => {
    const res = await A.post("/api/applications", validApp).expect(201);
    const app1 = res.body.data.application;
    expect(app1).toMatchObject({
      company: "Acme Corp",
      role: "Frontend Engineer",
      applicationDate: "2026-03-05",
      deadline: null,
      status: "Applied",
      jobUrl: "",
      notes: "",
    });
    expect(app1).not.toHaveProperty("userId");
    const stored = await Application.findById(app1.id).lean();
    expect(String(stored.userId)).toBe(alice.id);
    expect(stored.applicationDate.toISOString()).toBe("2026-03-05T00:00:00.000Z");
  });

  it("accepts all optional fields and normalises company/role whitespace", async () => {
    const res = await A.post("/api/applications", {
      company: "  Acme    Corp  ",
      role: " Senior   Dev ",
      applicationDate: "2026-03-05",
      deadline: "2026-04-01",
      status: "Interview",
      jobUrl: "https://example.com/jobs/1",
      notes: "  call recruiter  ",
    }).expect(201);
    expect(res.body.data.application).toMatchObject({
      company: "Acme Corp",
      role: "Senior Dev",
      deadline: "2026-04-01",
      status: "Interview",
      jobUrl: "https://example.com/jobs/1",
      notes: "call recruiter",
    });
  });

  it("treats empty-string and null optional fields as 'no value'", async () => {
    const res = await A.post("/api/applications", { ...validApp, deadline: "", jobUrl: "", notes: null }).expect(201);
    expect(res.body.data.application).toMatchObject({ deadline: null, jobUrl: "", notes: "" });
    await A.post("/api/applications", { ...validApp, deadline: null }).expect(201);
  });

  it("rejects missing required fields with field errors", async () => {
    const res = await A.post("/api/applications", {}).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.fieldErrors).sort()).toEqual(["applicationDate", "company", "role"]);
  });

  it.each([
    ["blank company", { company: "   " }, "company"],
    ["company too long", { company: "x".repeat(121) }, "company"],
    ["role too long", { role: "x".repeat(121) }, "role"],
    ["bad status", { status: "Ghosted" }, "status"],
    ["lowercase status", { status: "applied" }, "status"],
    ["impossible date", { applicationDate: "2026-02-30" }, "applicationDate"],
    ["wrong date format", { applicationDate: "03/05/2026" }, "applicationDate"],
    ["ISO datetime instead of date", { applicationDate: "2026-03-05T10:00:00Z" }, "applicationDate"],
    ["bad deadline", { deadline: "soon" }, "deadline"],
    ["javascript: url", { jobUrl: "javascript:alert(1)" }, "jobUrl"],
    ["ftp url", { jobUrl: "ftp://example.com/job" }, "jobUrl"],
    ["not a url", { jobUrl: "example dot com" }, "jobUrl"],
    ["notes too long", { notes: "x".repeat(2001) }, "notes"],
    ["non-string company", { company: { $gt: "" } }, "company"],
  ])("rejects %s", async (_label, patch, field) => {
    const res = await A.post("/api/applications", { ...validApp, ...patch }).expect(400);
    expect(res.body.error.fieldErrors[field]).toBeTruthy();
    expect(await Application.countDocuments()).toBe(0);
  });

  it("rejects client-supplied ownership and other protected fields (mass assignment)", async () => {
    for (const extra of [{ userId: bob.id }, { _id: GHOST_ID }, { createdAt: "2000-01-01" }, { isAdmin: true }]) {
      const res = await A.post("/api/applications", { ...validApp, ...extra }).expect(400);
      expect(Object.values(res.body.error.fieldErrors)[0]).toMatch(/unknown|read-only/i);
    }
    expect(await Application.countDocuments()).toBe(0);
  });
});

describe("GET /api/applications/:id", () => {
  it("returns an owned application", async () => {
    const { body } = await A.post("/api/applications", validApp).expect(201);
    const res = await A.get(`/api/applications/${body.data.application.id}`).expect(200);
    expect(res.body.data.application.company).toBe("Acme Corp");
  });

  it("400 for malformed ids (including 12-char strings), 404 for unknown ids", async () => {
    await A.get("/api/applications/not-an-id").expect(400);
    await A.get("/api/applications/123456789012").expect(400);
    const res = await A.get(`/api/applications/${GHOST_ID}`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/applications/:id", () => {
  let id;
  let before;
  beforeEach(async () => {
    const res = await A.post("/api/applications", { ...validApp, deadline: "2026-04-01", notes: "n" }).expect(201);
    before = res.body.data.application;
    id = before.id;
  });

  it("updates only the supplied fields and bumps updatedAt", async () => {
    await new Promise((r) => setTimeout(r, 15));
    const res = await A.patch(`/api/applications/${id}`, { status: "Offer" }).expect(200);
    const after = res.body.data.application;
    expect(after.status).toBe("Offer");
    expect(after.company).toBe(before.company);
    expect(after.deadline).toBe("2026-04-01");
    expect(after.createdAt).toBe(before.createdAt);
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());
  });

  it("can clear optional fields with null or empty string", async () => {
    const res = await A.patch(`/api/applications/${id}`, { deadline: null, notes: "" }).expect(200);
    expect(res.body.data.application).toMatchObject({ deadline: null, notes: "" });
  });

  it("normalises and validates updated values", async () => {
    const ok = await A.patch(`/api/applications/${id}`, { company: "  New   Name " }).expect(200);
    expect(ok.body.data.application.company).toBe("New Name");
    await A.patch(`/api/applications/${id}`, { status: "Nope" }).expect(400);
    await A.patch(`/api/applications/${id}`, { applicationDate: null }).expect(400);
    await A.patch(`/api/applications/${id}`, { jobUrl: "file:///etc/passwd" }).expect(400);
  });

  it("rejects an empty update", async () => {
    const res = await A.patch(`/api/applications/${id}`, {}).expect(400);
    expect(res.body.error.fieldErrors._form).toMatch(/at least one/i);
  });

  it("rejects protected fields and leaves the record unchanged", async () => {
    for (const body of [{ userId: bob.id }, { _id: GHOST_ID }, { id: GHOST_ID }, { createdAt: "2000-01-01" }, { updatedAt: "2000-01-01" }]) {
      await A.patch(`/api/applications/${id}`, body).expect(400);
    }
    const stored = await Application.findById(id).lean();
    expect(String(stored.userId)).toBe(alice.id);
    expect(stored.company).toBe("Acme Corp");
  });

  it("400 for malformed id, 404 for unknown id", async () => {
    await A.patch("/api/applications/xyz", { status: "Offer" }).expect(400);
    await A.patch(`/api/applications/${GHOST_ID}`, { status: "Offer" }).expect(404);
  });
});

describe("DELETE /api/applications/:id", () => {
  it("deletes an owned application", async () => {
    const { body } = await A.post("/api/applications", validApp).expect(201);
    const id = body.data.application.id;
    const res = await A.del(`/api/applications/${id}`).expect(200);
    expect(res.body.data).toMatchObject({ id, message: "Application deleted." });
    await A.get(`/api/applications/${id}`).expect(404);
    await A.del(`/api/applications/${id}`).expect(404); // repeated delete is safe
  });

  it("400 for malformed id", async () => {
    await A.del("/api/applications/bad").expect(400);
  });
});

describe("cross-user isolation", () => {
  let id;
  beforeEach(async () => {
    const res = await A.post("/api/applications", { ...validApp, notes: "private" }).expect(201);
    id = res.body.data.application.id;
  });

  it("another user gets 404 (not 403/200) for read, update and delete, and nothing changes", async () => {
    const read = await B.get(`/api/applications/${id}`).expect(404);
    const missing = await B.get(`/api/applications/${GHOST_ID}`).expect(404);
    expect(read.body).toEqual(missing.body); // indistinguishable from a nonexistent record
    expect(JSON.stringify(read.body)).not.toMatch(/Acme|private/);

    await B.patch(`/api/applications/${id}`, { status: "Rejected", company: "Hacked" }).expect(404);
    await B.del(`/api/applications/${id}`).expect(404);

    const stored = await Application.findById(id).lean();
    expect(stored.company).toBe("Acme Corp");
    expect(stored.status).toBe("Applied");
    expect(String(stored.userId)).toBe(alice.id);
  });

  it("lists, searches and counts only the caller's records", async () => {
    await seed(bob.id, [{ company: "BobCo", role: "Dev", applicationDate: "2026-01-01" }]);
    const bobList = await B.get("/api/applications?search=acme").expect(200);
    expect(bobList.body.data.applications).toHaveLength(0);
    expect(bobList.body.data.pagination.total).toBe(0);
    const bobAll = await B.get("/api/applications").expect(200);
    expect(names(bobAll)).toEqual(["BobCo"]);
    expect(bobAll.body.data.pagination.total).toBe(1);
    const aliceAll = await A.get("/api/applications").expect(200);
    expect(names(aliceAll)).toEqual(["Acme Corp"]);
  });

  it("ignores a userId query parameter (rejected as unknown)", async () => {
    await B.get(`/api/applications?userId=${alice.id}`).expect(400);
  });
});

describe("GET /api/applications (list)", () => {
  beforeEach(async () => {
    await seed(alice.id, [
      { company: "Acme Corp", role: "Frontend Engineer", applicationDate: "2026-01-10", deadline: "2026-02-01", status: "Applied" },
      { company: "Globex", role: "Backend Engineer", applicationDate: "2026-01-15", deadline: null, status: "Interview" },
      { company: "initech", role: "Data Analyst", applicationDate: "2026-02-01", deadline: "2026-03-01", status: "Offer" },
      { company: "Umbrella", role: "Security Engineer", applicationDate: "2026-02-10", deadline: "2026-02-20", status: "Rejected" },
      { company: "Hooli", role: "Product Designer", applicationDate: "2026-03-01", deadline: null, status: "Withdrawn" },
      { company: "C++ Labs (EU)", role: "Systems Engineer", applicationDate: "2026-03-05", deadline: "2026-04-01", status: "Applied" },
    ]);
  });

  it("defaults to newest application date first with pagination metadata", async () => {
    const res = await A.get("/api/applications").expect(200);
    expect(names(res)).toEqual(["C++ Labs (EU)", "Hooli", "Umbrella", "initech", "Globex", "Acme Corp"]);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 10, total: 6, totalPages: 1 });
  });

  it("returns an empty list with zero pages for a user with no applications", async () => {
    await Application.deleteMany({});
    const res = await A.get("/api/applications").expect(200);
    expect(res.body.data.applications).toEqual([]);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it("searches company and role, case-insensitively, as a literal substring", async () => {
    expect(names(await A.get("/api/applications?search=ACME"))).toEqual(["Acme Corp"]);
    expect(names(await A.get("/api/applications?search=engineer")).sort()).toEqual(["Acme Corp", "C++ Labs (EU)", "Globex", "Umbrella"]);
    expect(names(await A.get("/api/applications?search=" + encodeURIComponent("c++ labs (eu)")))).toEqual(["C++ Labs (EU)"]);
    const star = await A.get("/api/applications?search=" + encodeURIComponent(".*")).expect(200);
    expect(star.body.data.applications).toHaveLength(0); // no regex injection
    await A.get("/api/applications?search=" + encodeURIComponent("(")).expect(200); // never a 500
    expect(names(await A.get("/api/applications?search="))).toHaveLength(6); // empty search = no filter
  });

  it("filters by one or several statuses", async () => {
    expect(names(await A.get("/api/applications?status=Offer"))).toEqual(["initech"]);
    const repeated = await A.get("/api/applications?status=Applied&status=Offer").expect(200);
    expect(names(repeated).sort()).toEqual(["Acme Corp", "C++ Labs (EU)", "initech"]);
    const csv = await A.get("/api/applications?status=Applied,Offer").expect(200);
    expect(names(csv).sort()).toEqual(names(repeated).sort());
    expect(repeated.body.data.pagination.total).toBe(3);
  });

  it("filters application date ranges inclusively (and open-ended)", async () => {
    const both = await A.get("/api/applications?applicationDateFrom=2026-01-15&applicationDateTo=2026-02-10&sortOrder=asc").expect(200);
    expect(names(both)).toEqual(["Globex", "initech", "Umbrella"]);
    expect(names(await A.get("/api/applications?applicationDateFrom=2026-03-01")).sort()).toEqual(["C++ Labs (EU)", "Hooli"]);
    expect(names(await A.get("/api/applications?applicationDateTo=2026-01-10"))).toEqual(["Acme Corp"]);
  });

  it("filters deadline ranges inclusively and excludes applications without a deadline", async () => {
    const res = await A.get("/api/applications?deadlineFrom=2026-02-01&deadlineTo=2026-02-20&sortBy=deadline").expect(200);
    expect(names(res)).toEqual(["Acme Corp", "Umbrella"]);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it("combines search, status, date filters, sort and pagination consistently", async () => {
    const res = await A.get("/api/applications?search=engineer&status=Applied&applicationDateFrom=2026-01-01&sortBy=company&sortOrder=asc&limit=1&page=2").expect(200);
    expect(names(res)).toEqual(["C++ Labs (EU)"]);
    expect(res.body.data.pagination).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });

  it("sorts by company case-insensitively", async () => {
    const asc = await A.get("/api/applications?sortBy=company&sortOrder=asc").expect(200);
    expect(names(asc)).toEqual(["Acme Corp", "C++ Labs (EU)", "Globex", "Hooli", "initech", "Umbrella"]);
    const desc = await A.get("/api/applications?sortBy=company&sortOrder=desc").expect(200);
    expect(names(desc)).toEqual([...names(asc)].reverse());
  });

  it("sorts by status, breaking ties newest-created first", async () => {
    const res = await A.get("/api/applications?sortBy=status").expect(200);
    expect(res.body.data.applications.map((a) => a.status)).toEqual(["Applied", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"]);
    expect(names(res).slice(0, 2)).toEqual(["C++ Labs (EU)", "Acme Corp"]);
  });

  it("sorts by deadline with missing deadlines always last", async () => {
    const asc = await A.get("/api/applications?sortBy=deadline").expect(200); // default order: asc
    expect(names(asc)).toEqual(["Acme Corp", "Umbrella", "initech", "C++ Labs (EU)", "Hooli", "Globex"]);
    const desc = await A.get("/api/applications?sortBy=deadline&sortOrder=desc").expect(200);
    expect(names(desc)).toEqual(["C++ Labs (EU)", "initech", "Umbrella", "Acme Corp", "Hooli", "Globex"]);
    const paged = await A.get("/api/applications?sortBy=deadline&limit=2&page=3").expect(200);
    expect(names(paged)).toEqual(["Hooli", "Globex"]);
  });

  it("paginates and reports totals for the filtered set", async () => {
    const page2 = await A.get("/api/applications?limit=2&page=2").expect(200);
    expect(names(page2)).toEqual(["Umbrella", "initech"]);
    expect(page2.body.data.pagination).toEqual({ page: 2, limit: 2, total: 6, totalPages: 3 });
  });

  it("returns an empty page (200, accurate metadata) when the page is past the end", async () => {
    const res = await A.get("/api/applications?limit=2&page=9").expect(200);
    expect(res.body.data.applications).toEqual([]);
    expect(res.body.data.pagination).toEqual({ page: 9, limit: 2, total: 6, totalPages: 3 });
  });

  it("leaves a valid last page after deleting its only item", async () => {
    await seed(alice.id, Array.from({ length: 5 }, (_, i) => ({ company: `Extra ${i}`, role: "Dev", applicationDate: "2025-01-01" })));
    const page2 = await A.get("/api/applications?limit=10&page=2").expect(200);
    expect(page2.body.data.applications).toHaveLength(1);
    await A.del(`/api/applications/${page2.body.data.applications[0].id}`).expect(200);
    const after = await A.get("/api/applications?limit=10&page=2").expect(200);
    expect(after.body.data.applications).toEqual([]);
    expect(after.body.data.pagination).toMatchObject({ total: 10, totalPages: 1 });
  });

  it.each([
    ["page=0"], ["page=-1"], ["page=abc"], ["page=1.5"], ["page=100001"],
    ["limit=0"], ["limit=101"], ["limit=abc"], ["limit=2.5"],
    ["status=Ghosted"], ["status=Applied,Nope"],
    ["sortBy=password"], ["sortBy=userId"], ["sortBy=notes"], ["sortOrder=sideways"],
    ["applicationDateFrom=2026-13-01"], ["deadlineTo=yesterday"],
    ["applicationDateFrom=2026-03-01&applicationDateTo=2026-01-01"],
    ["deadlineFrom=2026-03-01&deadlineTo=2026-01-01"],
    ["staus=Offer"],
    ["search[$ne]=x"], ["status[$ne]=Offer"], ["page[$gt]=0"],
  ])("rejects invalid query %s with 400", async (qs) => {
    const res = await A.get(`/api/applications?${qs}`).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("names the offending parameter for a reversed range", async () => {
    const res = await A.get("/api/applications?applicationDateFrom=2026-03-01&applicationDateTo=2026-01-01").expect(400);
    expect(res.body.error.fieldErrors.applicationDateTo).toMatch(/before/i);
  });
});

describe("CORS for application methods", () => {
  it.each(["PATCH", "DELETE"])("allows %s preflight from the configured origin", async (method) => {
    const res = await request(app)
      .options("/api/applications/" + GHOST_ID)
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", method)
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token")
      .expect(204);
    expect(res.headers["access-control-allow-methods"]).toMatch(new RegExp(method));
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});

describe("Phase 1 regression guard", () => {
  it("session auth still works: me, logout, then applications are inaccessible", async () => {
    await A.get("/api/auth/me").expect(200);
    await A.post("/api/auth/logout", {}).expect(200);
    await A.get("/api/applications").expect(401);
  });
});
