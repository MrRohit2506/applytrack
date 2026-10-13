import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { anonymous, http, newUser, resetCollections, seed, startTestDb, stopTestDb } from "./helpers.js";

const TODAY = "2026-03-10"; // a Tuesday
let app;
let alice;
let bob;
let A;
let B;

// Alice: 8 applications. Pending (Applied/Interview) with deadlines: Acme 03-12, Globex 03-09, Wayne 03-10, Stark 03-30.
const aliceRows = [
  { company: "Acme", role: "Dev", applicationDate: "2026-01-05", deadline: "2026-03-12", status: "Applied" },
  { company: "Globex", role: "Dev", applicationDate: "2026-01-20", deadline: "2026-03-09", status: "Interview" },
  { company: "Initech", role: "Dev", applicationDate: "2026-02-02", status: "Offer" },
  { company: "Umbrella", role: "Dev", applicationDate: "2026-02-10", deadline: "2026-03-10", status: "Rejected" },
  { company: "Hooli", role: "Dev", applicationDate: "2026-03-01", deadline: "2026-03-05", status: "Withdrawn" },
  { company: "Stark", role: "Dev", applicationDate: "2026-03-04", deadline: "2026-03-30", status: "Applied" },
  { company: "Wayne", role: "Dev", applicationDate: "2026-03-09", deadline: "2026-03-10", status: "Applied" },
  { company: "Oscorp", role: "Dev", applicationDate: "2026-03-10", status: "Interview" },
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
  await seed(alice.id, aliceRows);
});

const overview = (u, qs = "") => u.get(`/api/analytics/overview?today=${TODAY}${qs}`);

describe("GET /api/analytics/overview", () => {
  it("requires authentication", async () => {
    const anon = http(await anonymous(app));
    await anon.get("/api/analytics/overview").expect(401);
  });

  it("counts every status and the interview/offer totals from the stored records", async () => {
    const { body } = await overview(A).expect(200);
    expect(body.data.totals).toEqual({
      total: 8,
      byStatus: { Applied: 3, Interview: 2, Offer: 1, Rejected: 1, Withdrawn: 1 },
      interviewCount: 2,
      offerCount: 1,
    });
  });

  it("computes rates with Withdrawn excluded from the denominator", async () => {
    const { rates } = (await overview(A).expect(200)).body.data;
    expect(rates.denominator).toBe(7);
    expect(rates.excludedWithdrawn).toBe(1);
    expect(rates.responseRate).toEqual({ numerator: 4, denominator: 7, percent: 57.1 });
    expect(rates.interviewRate).toEqual({ numerator: 3, denominator: 7, percent: 42.9 });
    expect(rates.offerRate).toEqual({ numerator: 1, denominator: 7, percent: 14.3 });
  });

  it("handles an account with zero applications (no errors, null rates, empty timeline)", async () => {
    const { data } = (await overview(B).expect(200)).body;
    expect(data.totals.total).toBe(0);
    expect(data.totals.byStatus).toEqual({ Applied: 0, Interview: 0, Offer: 0, Rejected: 0, Withdrawn: 0 });
    expect(data.rates.responseRate.percent).toBeNull();
    expect(data.rates.offerRate.percent).toBeNull();
    expect(data.timeline).toEqual([]);
    expect(data.deadlines).toMatchObject({ overdue: 0, dueToday: 0, upcoming: 0 });
    expect(data.recent).toEqual({ last7Days: 0, last30Days: 0 });
  });

  it("reports null rates when everything is withdrawn", async () => {
    await seed(bob.id, [{ company: "X", role: "Y", applicationDate: "2026-01-01", status: "Withdrawn" }]);
    const { rates, totals } = (await overview(B).expect(200)).body.data;
    expect(totals.total).toBe(1);
    expect(rates.denominator).toBe(0);
    expect(rates.responseRate.percent).toBeNull();
  });

  it("groups applications by month with continuous periods", async () => {
    const { timeline } = (await overview(A).expect(200)).body.data; // default groupBy=month
    expect(timeline).toEqual([
      { period: "2026-01-01", count: 2 },
      { period: "2026-02-01", count: 2 },
      { period: "2026-03-01", count: 4 },
    ]);
  });

  it("groups by ISO week (Monday start) and fills empty weeks", async () => {
    const { timeline, scope } = (await overview(A, "&groupBy=week").expect(200)).body.data;
    expect(scope.groupBy).toBe("week");
    expect(timeline[0]).toEqual({ period: "2026-01-05", count: 1 });
    expect(timeline).toContainEqual({ period: "2026-02-23", count: 1 }); // Hooli, Sunday 03-01 -> week of 02-23
    expect(timeline).toContainEqual({ period: "2026-03-09", count: 2 });
    expect(timeline).toContainEqual({ period: "2026-01-12", count: 0 });
    expect(timeline).toHaveLength(10);
    expect(timeline.reduce((n, t) => n + t.count, 0)).toBe(8);
  });

  it("groups by day", async () => {
    const { timeline } = (await overview(A, "&groupBy=day&from=2026-03-08&to=2026-03-10").expect(200)).body.data;
    expect(timeline).toEqual([
      { period: "2026-03-08", count: 0 },
      { period: "2026-03-09", count: 1 },
      { period: "2026-03-10", count: 1 },
    ]);
  });

  it("date range filters are inclusive on both ends", async () => {
    const feb = (await overview(A, "&from=2026-02-01&to=2026-02-28").expect(200)).body.data;
    expect(feb.totals.total).toBe(2);
    expect(feb.totals.byStatus).toMatchObject({ Offer: 1, Rejected: 1 });
    expect((await overview(A, "&from=2026-02-02&to=2026-02-10").expect(200)).body.data.totals.total).toBe(2); // both edge days
    expect((await overview(A, "&from=2026-02-03&to=2026-02-09").expect(200)).body.data.totals.total).toBe(0); // just inside both edges
    expect((await overview(A, "&from=2026-03-10&to=2026-03-10").expect(200)).body.data.totals.total).toBe(1); // single day
  });

  it("scopes totals to the range but not deadlines or recent activity", async () => {
    const { data } = (await overview(A, "&from=2026-02-01&to=2026-02-28").expect(200)).body;
    expect(data.deadlines).toMatchObject({ overdue: 1, dueToday: 1, upcoming: 1 });
    expect(data.recent).toEqual({ last7Days: 3, last30Days: 5 });
  });

  it("counts deadlines for pending applications only (Applied/Interview) within the window", async () => {
    const { deadlines } = (await overview(A).expect(200)).body.data;
    // overdue: Globex (03-09); dueToday: Wayne (03-10); upcoming: Acme (03-12). Stark (03-30) is outside the 7-day window;
    // Umbrella (Rejected) and Hooli (Withdrawn) are excluded by status; Initech/Oscorp have no deadline.
    expect(deadlines).toEqual({ overdue: 1, dueToday: 1, upcoming: 1, windowDays: 7 });
    const wide = (await overview(A, "&windowDays=30").expect(200)).body.data.deadlines;
    expect(wide).toMatchObject({ upcoming: 2, windowDays: 30 });
  });

  it("uses the client-supplied calendar date for 'today' (no timezone shift)", async () => {
    const next = (await A.get("/api/analytics/overview?today=2026-03-11").expect(200)).body.data;
    expect(next.scope.today).toBe("2026-03-11");
    expect(next.deadlines).toMatchObject({ overdue: 2, dueToday: 0, upcoming: 1 }); // Wayne is now overdue, Acme 1 day closer
  });

  it("defaults today to the server's UTC date", async () => {
    const { scope } = (await A.get("/api/analytics/overview").expect(200)).body.data;
    expect(scope.today).toBe(new Date().toISOString().slice(0, 10));
    expect(scope.groupBy).toBe("month");
    expect(scope.windowDays).toBe(7);
  });

  it("never mixes users: each account sees only its own data", async () => {
    await seed(bob.id, [{ company: "BobCo", role: "Dev", applicationDate: "2026-02-01", status: "Offer", deadline: "2026-03-11" }]);
    const b = (await overview(B).expect(200)).body.data;
    expect(b.totals.total).toBe(1);
    expect(b.totals.byStatus.Offer).toBe(1);
    expect(b.deadlines).toMatchObject({ overdue: 0, dueToday: 0, upcoming: 0 }); // Offer is not pending
    const a = (await overview(A).expect(200)).body.data;
    expect(a.totals.total).toBe(8);
    expect(a.totals.byStatus.Offer).toBe(1);
  });

  it.each([
    ["from=2026-03-01&to=2026-01-01"],
    ["groupBy=year"],
    ["windowDays=0"],
    ["windowDays=91"],
    ["windowDays=abc"],
    ["today=tomorrow"],
    ["from=2026-02-30"],
    ["userId=abc"],
    ["from[$ne]=x"],
    ["groupBy=day&from=2020-01-01&to=2026-12-31"],
  ])("rejects invalid query %s", async (qs) => {
    const res = await A.get(`/api/analytics/overview?${qs}`).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
