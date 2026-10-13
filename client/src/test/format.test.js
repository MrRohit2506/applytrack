import { describe, expect, it } from "vitest";
import { deadlineLabel, formatPercent, formatPeriod, plural } from "../lib/format.js";

describe("format helpers", () => {
  it("plural", () => {
    expect(plural(1, "application")).toBe("1 application");
    expect(plural(0, "application")).toBe("0 applications");
    expect(plural(2, "day")).toBe("2 days");
  });

  it("formatPercent shows a dash when unavailable", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(57.1)).toBe("57.1%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("formatPeriod uses the date parts (no timezone shift)", () => {
    expect(formatPeriod("2026-03-01", "month")).toMatch(/2026/);
    expect(formatPeriod("2026-03-09", "day")).toMatch(/9/);
    expect(formatPeriod("2026-03-09", "week")).toMatch(/^Week of .*9/);
    expect(formatPeriod("2026-01-01", "day")).toMatch(/1/);
  });

  it("deadlineLabel", () => {
    expect(deadlineLabel("overdue", -1)).toBe("Overdue by 1 day");
    expect(deadlineLabel("overdue", -5)).toBe("Overdue by 5 days");
    expect(deadlineLabel("dueToday", 0)).toBe("Due today");
    expect(deadlineLabel("upcoming", 1)).toBe("Due tomorrow");
    expect(deadlineLabel("upcoming", 4)).toBe("Due in 4 days");
  });
});
