import { describe, expect, it } from "vitest";
import {
  MAX_TIMELINE_BUCKETS,
  TooManyBucketsError,
  bucketStart,
  buildRecentPipeline,
  buildScopedPipeline,
  computeRates,
  fillTimeline,
  nextBucket,
  normaliseStatusCounts,
} from "../src/services/analytics.js";
import { parseCalendarDate as d } from "../src/utils/dates.js";

const counts = (o = {}) => ({ Applied: 0, Interview: 0, Offer: 0, Rejected: 0, Withdrawn: 0, ...o });

describe("computeRates", () => {
  it("uses total minus Withdrawn as the denominator", () => {
    const r = computeRates(counts({ Applied: 4, Interview: 2, Offer: 1, Rejected: 3, Withdrawn: 2 }));
    expect(r.denominator).toBe(10);
    expect(r.excludedWithdrawn).toBe(2);
    expect(r.responseRate).toEqual({ numerator: 6, denominator: 10, percent: 60 });
    expect(r.interviewRate).toEqual({ numerator: 3, denominator: 10, percent: 30 });
    expect(r.offerRate).toEqual({ numerator: 1, denominator: 10, percent: 10 });
  });

  it("rounds to one decimal", () => {
    expect(computeRates(counts({ Applied: 2, Offer: 1 })).offerRate.percent).toBe(33.3);
  });

  it("returns null percentages (never 0%) when the denominator is zero", () => {
    for (const byStatus of [counts(), counts({ Withdrawn: 3 })]) {
      const r = computeRates(byStatus);
      expect(r.denominator).toBe(0);
      expect(r.responseRate.percent).toBeNull();
      expect(r.interviewRate.percent).toBeNull();
      expect(r.offerRate.percent).toBeNull();
    }
  });

  it("is 0% (not unavailable) when there are applications but no responses", () => {
    expect(computeRates(counts({ Applied: 5 })).responseRate.percent).toBe(0);
  });
});

describe("normaliseStatusCounts", () => {
  it("always returns all five statuses and ignores unknown ones", () => {
    expect(normaliseStatusCounts([{ _id: "Offer", n: 2 }, { _id: "Bogus", n: 9 }])).toEqual(counts({ Offer: 2 }));
    expect(normaliseStatusCounts([])).toEqual(counts());
  });
});

describe("time buckets", () => {
  it("weeks start on Monday", () => {
    expect(bucketStart("2026-03-09", "week")).toBe("2026-03-09"); // Monday
    expect(bucketStart("2026-03-15", "week")).toBe("2026-03-09"); // Sunday belongs to the previous Monday
    expect(bucketStart("2026-03-16", "week")).toBe("2026-03-16");
    expect(bucketStart("2026-01-01", "week")).toBe("2025-12-29"); // across a year boundary
  });

  it("month and day buckets", () => {
    expect(bucketStart("2026-03-31", "month")).toBe("2026-03-01");
    expect(bucketStart("2026-03-31", "day")).toBe("2026-03-31");
    expect(nextBucket("2026-12-01", "month")).toBe("2027-01-01");
    expect(nextBucket("2026-03-30", "week")).toBe("2026-04-06");
    expect(nextBucket("2026-02-28", "day")).toBe("2026-03-01");
  });

  it("fills gaps with zero counts", () => {
    const rows = [{ period: "2026-01-01", count: 2 }, { period: "2026-04-01", count: 1 }];
    expect(fillTimeline(rows, "month")).toEqual([
      { period: "2026-01-01", count: 2 },
      { period: "2026-02-01", count: 0 },
      { period: "2026-03-01", count: 0 },
      { period: "2026-04-01", count: 1 },
    ]);
  });

  it("extends to the requested range ends and returns [] when there is no data", () => {
    const rows = [{ period: "2026-02-01", count: 1 }];
    expect(fillTimeline(rows, "month", { from: "2026-01-15", to: "2026-03-20" }).map((r) => r.period)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(fillTimeline([], "month", { from: "2026-01-01" })).toEqual([]);
  });

  it("refuses to build an unreasonable number of buckets", () => {
    const rows = [{ period: "2000-01-01", count: 1 }, { period: "2026-01-01", count: 1 }];
    expect(() => fillTimeline(rows, "day")).toThrow(TooManyBucketsError);
    expect(MAX_TIMELINE_BUCKETS).toBe(400);
  });
});

describe("pipelines", () => {
  it("scoped pipeline starts with the supplied (ownership) match and truncates in UTC", () => {
    const match = { userId: { id: "u" } };
    const [m, facet] = buildScopedPipeline(match, "week");
    expect(m).toEqual({ $match: match });
    expect(facet.$facet.timeline[0].$group._id.$dateTrunc).toEqual({ date: "$applicationDate", unit: "week", timezone: "UTC", startOfWeek: "monday" });
    expect(buildScopedPipeline(match, "month")[1].$facet.timeline[0].$group._id.$dateTrunc.startOfWeek).toBe(undefined);
  });

  it("recent pipeline covers the last 30 days including today, owner only", () => {
    const user = { id: "u" };
    const [m] = buildRecentPipeline(user, d("2026-03-30"));
    expect(m.$match.userId).toBe(user);
    expect(m.$match.applicationDate.$gte.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(m.$match.applicationDate.$lte.toISOString()).toBe("2026-03-30T00:00:00.000Z");
  });
});
