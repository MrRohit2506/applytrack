import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Application } from "../src/models/Application.js";
import { anonymous, http, newUser, resetCollections, seed, startTestDb, stopTestDb, validApp } from "./helpers.js";

let app;
let alice;
let bob;
let A;
let B;

const rows = [
  { company: "Acme", role: "Dev", applicationDate: "2026-01-05", deadline: "2026-03-12", status: "Applied", notes: "SECRET-NOTE" },
  { company: "Globex", role: "Dev", applicationDate: "2026-01-20", deadline: "2026-03-09", status: "Interview" },
  { company: "Umbrella", role: "Dev", applicationDate: "2026-02-10", deadline: "2026-03-10", status: "Rejected" },
  { company: "Hooli", role: "Dev", applicationDate: "2026-03-01", deadline: "2026-03-05", status: "Withdrawn" },
  { company: "Initech", role: "Dev", applicationDate: "2026-02-02", deadline: "2026-03-11", status: "Offer" },
  { company: "Stark", role: "Dev", applicationDate: "2026-03-04", deadline: "2026-03-30", status: "Applied" },
  { company: "Wayne", role: "Dev", applicationDate: "2026-03-09", deadline: "2026-03-10", status: "Applied" },
  { company: "Oscorp", role: "Dev", applicationDate: "2026-03-10", status: "Interview" }, // no deadline
];

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
  await seed(alice.id, rows);
});

const reminders = (u, qs = "", today = "2026-03-10") => u.get(`/api/reminders?today=${today}${qs}`);
const names = (res) => res.body.data.reminders.map((r) => r.company);

describe("GET /api/reminders", () => {
  it("requires authentication", async () => {
    await http(await anonymous(app)).get("/api/reminders").expect(401);
  });

  it("returns overdue, due-today and upcoming deadlines ordered by deadline, with day offsets", async () => {
    const res = await reminders(A).expect(200);
    expect(res.body.data.reminders).toEqual([
      expect.objectContaining({ company: "Globex", category: "overdue", daysUntil: -1, deadline: "2026-03-09" }),
      expect.objectContaining({ company: "Wayne", category: "dueToday", daysUntil: 0, deadline: "2026-03-10" }),
      expect.objectContaining({ company: "Acme", category: "upcoming", daysUntil: 2, deadline: "2026-03-12" }),
    ]);
    expect(res.body.data).toMatchObject({ today: "2026-03-10", windowDays: 7, counts: { overdue: 1, dueToday: 1, upcoming: 1, total: 3 }, truncated: false });
  });

  it("excludes applications without a deadline and non-pending statuses (Offer, Rejected, Withdrawn)", async () => {
    const list = names(await reminders(A, "&windowDays=90"));
    for (const excluded of ["Oscorp", "Umbrella", "Hooli", "Initech"]) expect(list).not.toContain(excluded);
    expect(list).toContain("Stark"); // pending, deadline inside a 90-day window
  });

  it("respects the window boundary exactly (inclusive of today + windowDays)", async () => {
    expect(names(await reminders(A, "&windowDays=1"))).toEqual(["Globex", "Wayne"]); // Acme is 2 days away
    expect(names(await reminders(A, "&windowDays=2"))).toEqual(["Globex", "Wayne", "Acme"]); // exactly 2 days away
  });

  it("changing 'today' by one calendar day moves a deadline from due-today to overdue", async () => {
    const day = (await reminders(A, "", "2026-03-10")).body.data.reminders.find((r) => r.company === "Wayne");
    const next = (await reminders(A, "", "2026-03-11")).body.data.reminders.find((r) => r.company === "Wayne");
    expect(day.category).toBe("dueToday");
    expect(next).toMatchObject({ category: "overdue", daysUntil: -1 });
  });

  it("does not expose notes or job URLs", async () => {
    const res = await reminders(A).expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET-NOTE|notes|jobUrl|userId/);
  });

  it("is strictly per user", async () => {
    await seed(bob.id, [{ company: "BobCo", role: "Dev", applicationDate: "2026-03-01", deadline: "2026-03-11", status: "Applied" }]);
    expect(names(await reminders(B))).toEqual(["BobCo"]);
    expect(names(await reminders(A))).not.toContain("BobCo");
    const none = await reminders(http(await newUser(app, "carol@example.com"))).expect(200);
    expect(none.body.data.reminders).toEqual([]);
    expect(none.body.data.counts).toEqual({ overdue: 0, dueToday: 0, upcoming: 0, total: 0 });
  });

  it("reflects changes immediately: edit deadline, change status, delete", async () => {
    const id = (await Application.findOne({ userId: alice.id, company: "Acme" }))._id;
    await A.patch(`/api/applications/${id}`, { deadline: "2026-06-01" }).expect(200);
    expect(names(await reminders(A))).not.toContain("Acme");
    await A.patch(`/api/applications/${id}`, { deadline: "2026-03-12" }).expect(200);
    expect(names(await reminders(A))).toContain("Acme");
    await A.patch(`/api/applications/${id}`, { status: "Offer" }).expect(200);
    expect(names(await reminders(A))).not.toContain("Acme");
    await A.patch(`/api/applications/${id}`, { status: "Applied" }).expect(200);
    await A.del(`/api/applications/${id}`).expect(200);
    expect(names(await reminders(A))).not.toContain("Acme");
    const created = await A.post("/api/applications", { ...validApp, applicationDate: "2026-03-01", deadline: "2026-03-10" }).expect(201);
    expect(names(await reminders(A))).toContain("Acme Corp");
    expect(created.body.data.application.deadline).toBe("2026-03-10");
  });

  it("caps the list at 100 items but still reports the true counts", async () => {
    await seed(bob.id, Array.from({ length: 105 }, (_, i) => ({ company: `Late ${i}`, role: "Dev", applicationDate: "2025-01-01", deadline: "2026-01-01", status: "Applied" })));
    const res = await reminders(B).expect(200);
    expect(res.body.data.reminders).toHaveLength(100);
    expect(res.body.data.counts).toMatchObject({ overdue: 105, total: 105 });
    expect(res.body.data.truncated).toBe(true);
  });

  it.each([["windowDays=0"], ["windowDays=91"], ["windowDays=x"], ["today=2026-02-30"], ["from=2026-01-01"], ["userId=1"]])(
    "rejects invalid query %s",
    async (qs) => {
      await A.get(`/api/reminders?${qs}`).expect(400);
    },
  );
});
