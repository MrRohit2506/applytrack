import { describe, expect, it } from "vitest";
import {
  buildDeadlinePipeline,
  buildFilter,
  buildPagination,
  buildSort,
  escapeRegex,
  serializeApplication,
} from "../src/services/applicationQuery.js";
import { parseCalendarDate as d } from "../src/utils/dates.js";

const USER = { id: "user-1" };
const base = { search: "", status: [], sortBy: "applicationDate", sortOrder: "desc", page: 1, limit: 10 };

describe("buildFilter", () => {
  it("always scopes by userId, even with no filters", () => {
    expect(buildFilter(USER, base)).toEqual({ userId: USER });
  });

  it("builds an escaped, case-insensitive search over company and role", () => {
    const f = buildFilter(USER, { ...base, search: "C++ (EU)" });
    expect(f.userId).toBe(USER);
    expect(f.$or).toHaveLength(2);
    const re = f.$or[0].company;
    expect(re.flags).toBe("i");
    expect(re.test("c++ (eu) labs")).toBe(true);
    expect(re.test("cc (eu)")).toBe(false); // "+" is literal, not a quantifier
    expect(buildFilter(USER, { ...base, search: ".*" }).$or[0].company.test("anything")).toBe(false);
    expect(escapeRegex("a.b*c")).toBe("a\\.b\\*c");
  });

  it("uses equality for one status and $in for several", () => {
    expect(buildFilter(USER, { ...base, status: ["Offer"] }).status).toBe("Offer");
    expect(buildFilter(USER, { ...base, status: ["Offer", "Applied"] }).status).toEqual({ $in: ["Offer", "Applied"] });
  });

  it("builds inclusive date ranges, including open-ended ones", () => {
    const f = buildFilter(USER, {
      ...base,
      applicationDateFrom: d("2026-01-01"),
      applicationDateTo: d("2026-01-31"),
      deadlineFrom: d("2026-02-01"),
    });
    expect(f.applicationDate).toEqual({ $gte: d("2026-01-01"), $lte: d("2026-01-31") });
    expect(f.deadline).toEqual({ $gte: d("2026-02-01") });
    expect(buildFilter(USER, { ...base, applicationDateTo: d("2026-01-31") }).applicationDate).toEqual({ $lte: d("2026-01-31") });
  });

  it("never lets query values replace the ownership key", () => {
    const f = buildFilter(USER, { ...base, userId: "attacker", search: "x" });
    expect(f.userId).toBe(USER);
  });
});

describe("sorting and pagination helpers", () => {
  it("sorts by the chosen field with a deterministic _id tie-break", () => {
    expect(buildSort({ sortBy: "company", sortOrder: "asc" })).toEqual({ company: 1, _id: -1 });
    expect(buildSort({ sortBy: "applicationDate", sortOrder: "desc" })).toEqual({ applicationDate: -1, _id: -1 });
  });

  it("deadline pipeline matches first, sorts missing deadlines last, then pages", () => {
    const filter = { userId: USER };
    const p = buildDeadlinePipeline(filter, { sortOrder: "desc", limit: 5 }, 10);
    expect(p[0]).toEqual({ $match: filter });
    expect(p[2].$sort).toEqual({ _noDeadline: 1, deadline: -1, _id: -1 });
    expect(p[3]).toEqual({ $skip: 10 });
    expect(p[4]).toEqual({ $limit: 5 });
  });

  it("computes pagination metadata, with zero pages when nothing matches", () => {
    expect(buildPagination(2, 10, 25)).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(buildPagination(1, 10, 0)).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
    expect(buildPagination(1, 10, 10).totalPages).toBe(1);
  });
});

describe("serializeApplication", () => {
  it("exposes calendar-date strings and omits userId", () => {
    const out = serializeApplication({
      _id: "abc",
      userId: "secret",
      company: "Acme",
      role: "Dev",
      applicationDate: d("2026-03-05"),
      deadline: null,
      status: "Applied",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(out.applicationDate).toBe("2026-03-05");
    expect(out.deadline).toBeNull();
    expect(out.jobUrl).toBe("");
    expect(out).not.toHaveProperty("userId");
    expect(out.id).toBe("abc");
  });
});
