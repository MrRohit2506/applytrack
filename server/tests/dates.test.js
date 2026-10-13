import { describe, expect, it } from "vitest";
import { formatCalendarDate, parseCalendarDate } from "../src/utils/dates.js";

describe("calendar dates", () => {
  it("round-trips YYYY-MM-DD without shifting the day", () => {
    for (const s of ["2026-01-01", "2026-12-31", "2024-02-29", "2026-03-08", "2026-11-01"]) {
      expect(formatCalendarDate(parseCalendarDate(s))).toBe(s);
    }
  });

  it("stores calendar dates at UTC midnight", () => {
    expect(parseCalendarDate("2026-03-05").toISOString()).toBe("2026-03-05T00:00:00.000Z");
  });

  it("rejects impossible or malformed dates", () => {
    for (const s of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "26-01-01", "2026/01/01", "2026-1-1", "", "0050-01-01", "2200-01-01", "2026-01-01T00:00:00Z"]) {
      expect(parseCalendarDate(s)).toBeNull();
    }
    expect(parseCalendarDate(undefined)).toBeNull();
    expect(parseCalendarDate(20260101)).toBeNull();
  });
});
