import { describe, expect, it } from "vitest";
import { buildDeadlineCountsPipeline, buildReminderPipeline, classifyDeadline, countsFromGroups, toReminder } from "../src/services/deadlines.js";
import { addDays, daysBetween, formatCalendarDate, parseCalendarDate as d } from "../src/utils/dates.js";

describe("classifyDeadline (calendar dates, window = 7)", () => {
  const today = "2026-03-10";
  it("overdue, due today, upcoming and outside the window", () => {
    expect(classifyDeadline("2026-03-09", today, 7)).toEqual({ category: "overdue", daysUntil: -1 });
    expect(classifyDeadline("2025-01-01", today, 7).category).toBe("overdue");
    expect(classifyDeadline("2026-03-10", today, 7)).toEqual({ category: "dueToday", daysUntil: 0 });
    expect(classifyDeadline("2026-03-11", today, 7)).toEqual({ category: "upcoming", daysUntil: 1 });
    expect(classifyDeadline("2026-03-17", today, 7)).toEqual({ category: "upcoming", daysUntil: 7 }); // last day inside
    expect(classifyDeadline("2026-03-18", today, 7)).toBeNull(); // first day outside
  });

  it("is exact across month, year and leap-day boundaries and DST changes", () => {
    expect(classifyDeadline("2026-01-02", "2025-12-31", 7).daysUntil).toBe(2);
    expect(classifyDeadline("2024-03-01", "2024-02-28", 7).daysUntil).toBe(2); // leap year
    expect(classifyDeadline("2026-03-09", "2026-03-08", 7).daysUntil).toBe(1); // US DST starts 2026-03-08
    expect(classifyDeadline("2026-11-02", "2026-11-01", 7).daysUntil).toBe(1); // US DST ends 2026-11-01
  });

  it("a larger window includes later deadlines", () => {
    expect(classifyDeadline("2026-03-30", today, 30).category).toBe("upcoming");
  });
});

describe("date helpers", () => {
  it("addDays/daysBetween work on calendar days", () => {
    expect(formatCalendarDate(addDays(d("2026-02-27"), 3))).toBe("2026-03-02");
    expect(formatCalendarDate(addDays(d("2026-01-01"), -1))).toBe("2025-12-31");
    expect(daysBetween("2026-03-10", "2026-03-17")).toBe(7);
    expect(daysBetween("2026-03-10", "2026-03-03")).toBe(-7);
  });
});

describe("reminder pipelines", () => {
  const user = { id: "u1" };
  const today = d("2026-03-10");

  it("match only the owner's pending applications that have a deadline within the window", () => {
    const [match] = buildDeadlineCountsPipeline(user, today, 7);
    expect(match.$match.userId).toBe(user);
    expect(match.$match.status).toEqual({ $in: ["Applied", "Interview"] });
    expect(match.$match.deadline.$ne).toBeNull();
    expect(formatCalendarDate(match.$match.deadline.$lte)).toBe("2026-03-17");
    const [m2, facet] = buildReminderPipeline(user, today, 7);
    expect(m2.$match.userId).toBe(user);
    expect(facet.$facet.items[1]).toEqual({ $limit: 100 });
  });

  it("counts and annotations", () => {
    expect(countsFromGroups([{ _id: "overdue", n: 2 }, { _id: "upcoming", n: 5 }])).toEqual({ overdue: 2, dueToday: 0, upcoming: 5 });
    expect(countsFromGroups([])).toEqual({ overdue: 0, dueToday: 0, upcoming: 0 });
    const r = toReminder({ _id: "x1", company: "Acme", role: "Dev", status: "Applied", deadline: d("2026-03-12"), applicationDate: d("2026-03-01") }, "2026-03-10", 7);
    expect(r).toEqual({ id: "x1", company: "Acme", role: "Dev", status: "Applied", applicationDate: "2026-03-01", deadline: "2026-03-12", category: "upcoming", daysUntil: 2 });
    expect(r).not.toHaveProperty("notes");
  });
});
