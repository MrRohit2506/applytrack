import { describe, expect, it } from "vitest";
import { validateApplicationForm, validateDateRanges } from "../lib/applicationValidators.js";
import { formatCalendarDate, isValidCalendarDate, todayISO } from "../lib/dates.js";

const ok = { company: "Acme", role: "Dev", applicationDate: "2026-03-05", deadline: "", status: "Applied", jobUrl: "", notes: "" };

describe("validateApplicationForm", () => {
  it("accepts a minimal valid form", () => {
    expect(validateApplicationForm(ok)).toEqual({});
  });

  it("requires company, job title and application date", () => {
    const e = validateApplicationForm({ ...ok, company: "  ", role: "", applicationDate: "" });
    expect(Object.keys(e).sort()).toEqual(["applicationDate", "company", "role"]);
  });

  it("enforces length limits after whitespace normalisation", () => {
    expect(validateApplicationForm({ ...ok, company: "x".repeat(121) }).company).toBe("Company must be at most 120 characters");
    expect(validateApplicationForm({ ...ok, company: "a".repeat(120) }).company).toBe(undefined);
    expect(validateApplicationForm({ ...ok, notes: "n".repeat(2001) }).notes).toBe("Notes must be at most 2000 characters");
  });

  it("validates optional deadline and job URL only when present", () => {
    expect(validateApplicationForm({ ...ok, deadline: "2026-02-30" }).deadline).toBe("Enter a valid date");
    expect(validateApplicationForm({ ...ok, deadline: "2026-04-01" }).deadline).toBe(undefined);
    expect(validateApplicationForm({ ...ok, jobUrl: "javascript:alert(1)" }).jobUrl).toBe("Enter a valid http:// or https:// link");
    expect(validateApplicationForm({ ...ok, jobUrl: "ftp://x.com/a" }).jobUrl).toBe("Enter a valid http:// or https:// link");
    expect(validateApplicationForm({ ...ok, jobUrl: "https://example.com/jobs/1" }).jobUrl).toBe(undefined);
  });

  it("rejects unknown statuses", () => {
    expect(validateApplicationForm({ ...ok, status: "Ghosted" }).status).toBe("Choose a status");
  });
});

describe("validateDateRanges", () => {
  it("flags reversed ranges, allows equal and open-ended ones", () => {
    expect(validateDateRanges({ applicationDateFrom: "2026-03-01", applicationDateTo: "2026-01-01" })).toEqual({
      applicationDateTo: "End date must not be before the start date",
    });
    expect(validateDateRanges({ deadlineFrom: "2026-03-01", deadlineTo: "2026-02-01" }).deadlineTo).toBe("End date must not be before the start date");
    expect(validateDateRanges({ applicationDateFrom: "2026-03-01", applicationDateTo: "2026-03-01" })).toEqual({});
    expect(validateDateRanges({ applicationDateFrom: "2026-03-01", applicationDateTo: "" })).toEqual({});
  });
});

describe("calendar dates", () => {
  it("validates real calendar dates only", () => {
    expect(isValidCalendarDate("2024-02-29")).toBe(true);
    expect(isValidCalendarDate("2025-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-1-1")).toBe(false);
    expect(isValidCalendarDate("")).toBe(false);
  });

  it("formats without shifting the day and shows a dash for missing dates", () => {
    expect(formatCalendarDate("2026-03-05")).toMatch(/5/);
    expect(formatCalendarDate("2026-01-01")).toMatch(/2026/);
    expect(formatCalendarDate(null)).toBe("—");
  });

  it("todayISO is a valid YYYY-MM-DD", () => {
    expect(isValidCalendarDate(todayISO())).toBe(true);
  });
});
