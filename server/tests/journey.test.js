import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseCsv } from "../src/utils/csv.js";
import { anonymous, http, newUser, resetCollections, startTestDb, stopTestDb } from "./helpers.js";

const TODAY = "2026-03-10";
let app;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
});
afterAll(stopTestDb);
beforeEach(resetCollections);

const rawText = (r) => r.buffer(true).parse((res, cb) => {
  res.setEncoding("utf8");
  let d = "";
  res.on("data", (c) => (d += c));
  res.on("end", () => cb(null, d));
});

describe("end-to-end API journey (real app + isolated database)", () => {
  it("register -> create -> edit/filter -> analytics -> reminders -> export -> import -> logout", async () => {
    // 1. anonymous visitors are locked out
    const anon = http(await anonymous(app));
    await anon.get("/api/auth/me").expect(401);
    await anon.get("/api/applications").expect(401);

    // 2. register (this signs the user in) and restore the session
    const alice = await newUser(app, "alice@example.com");
    const A = http(alice);
    expect((await A.get("/api/auth/me").expect(200)).body.data.user.email).toBe("alice@example.com");

    // 3. create applications
    const acme = (await A.post("/api/applications", { company: "Acme", role: "Frontend Engineer", applicationDate: "2026-03-01", deadline: "2026-03-12", jobUrl: "https://example.com/jobs/1", notes: "Referred, \"strong fit\"\nsecond line" }).expect(201)).body.data.application;
    await A.post("/api/applications", { company: "Globex", role: "Backend Engineer", applicationDate: "2026-02-10", status: "Rejected", deadline: "2026-03-09" }).expect(201);

    // 4. edit and filter
    await A.patch(`/api/applications/${acme.id}`, { status: "Interview" }).expect(200);
    const interview = await A.get("/api/applications?status=Interview&search=acme").expect(200);
    expect(interview.body.data.applications.map((a) => a.company)).toEqual(["Acme"]);
    expect(interview.body.data.pagination).toMatchObject({ total: 1, totalPages: 1 });
    const sorted = await A.get("/api/applications?sortBy=company&sortOrder=desc").expect(200);
    expect(sorted.body.data.applications.map((a) => a.company)).toEqual(["Globex", "Acme"]);

    // 5. analytics reflect the stored data
    const stats = (await A.get(`/api/analytics/overview?today=${TODAY}`).expect(200)).body.data;
    expect(stats.totals).toMatchObject({ total: 2, interviewCount: 1, offerCount: 0, byStatus: { Interview: 1, Rejected: 1, Applied: 0 } });
    expect(stats.rates.responseRate).toEqual({ numerator: 2, denominator: 2, percent: 100 });
    expect(stats.rates.offerRate.percent).toBe(0);

    // 6. reminders: Acme (Interview, due in 2 days) appears; Globex (Rejected) does not
    const rem = (await A.get(`/api/reminders?today=${TODAY}`).expect(200)).body.data;
    expect(rem.reminders.map((r) => [r.company, r.category, r.daysUntil])).toEqual([["Acme", "upcoming", 2]]);

    // 7. export
    const exported = (await rawText(A.get("/api/applications/export")).expect(200)).body;
    const records = parseCsv(exported);
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual(["company", "role", "applicationDate", "deadline", "status", "jobUrl", "notes"]);

    // 8. import the export into a second account; its data matches, and Alice's is untouched
    const bob = await newUser(app, "bob@example.com");
    const B = http(bob);
    const post = (qs) => B.agent.post(`/api/applications/import${qs}`).set("X-CSRF-Token", bob.token).set("Content-Type", "text/csv").send(exported);
    const preview = (await post("").expect(200)).body.data;
    expect(preview).toMatchObject({ committed: false, validRows: 2, importable: 2 });
    expect((await B.get("/api/applications").expect(200)).body.data.pagination.total).toBe(0); // preview wrote nothing
    const done = (await post("?commit=true").expect(200)).body.data;
    expect(done).toMatchObject({ imported: 2, outcome: "completed" });
    const bobStats = (await B.get(`/api/analytics/overview?today=${TODAY}`).expect(200)).body.data;
    expect(bobStats.totals.byStatus).toEqual(stats.totals.byStatus);
    const bobAcme = (await B.get("/api/applications?search=acme").expect(200)).body.data.applications[0];
    expect(bobAcme.notes).toBe("Referred, \"strong fit\"\nsecond line");
    expect(bobAcme.id).not.toBe(acme.id);

    // 9. importing the same file again is a no-op (duplicates are skipped)
    const again = (await post("?commit=true").expect(200)).body.data;
    expect(again).toMatchObject({ imported: 0, skippedDuplicates: 2, duplicateRows: 2 });

    // 10. delete -> analytics and reminders follow
    await A.del(`/api/applications/${acme.id}`).expect(200);
    expect((await A.get(`/api/analytics/overview?today=${TODAY}`)).body.data.totals.total).toBe(1);
    expect((await A.get(`/api/reminders?today=${TODAY}`)).body.data.reminders).toEqual([]);

    // 11. logout: private routes and APIs are closed, a replayed cookie is dead, other accounts are unaffected
    const cookie = (await A.post("/api/auth/login", { email: "alice@example.com", password: "Sup3rSecret!" }).expect(200)).headers["set-cookie"].find((c) => c.startsWith("applytrack_session=")).split(";")[0];
    await A.post("/api/auth/logout", {}).expect(200);
    for (const path of ["/api/auth/me", "/api/applications", "/api/applications/export", "/api/analytics/overview", "/api/reminders"]) {
      await A.get(path).expect(401);
    }
    await request(app).get("/api/applications").set("Cookie", cookie).expect(401);
    expect((await B.get("/api/applications").expect(200)).body.data.pagination.total).toBe(2);
  });
});
