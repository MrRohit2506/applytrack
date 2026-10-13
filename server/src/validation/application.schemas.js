import { z } from "zod";
import { APPLICATION_STATUSES, DEFAULT_SORT_ORDER, SORT_FIELDS } from "../constants/applicationStatus.js";
import { parseCalendarDate } from "../utils/dates.js";

export const LIMITS = Object.freeze({
  company: 120,
  role: 120,
  jobUrl: 2048,
  notes: 2000,
  search: 100,
  defaultLimit: 10,
  maxLimit: 100,
  maxPage: 100000,
});

// Company/role/search: trim and collapse internal whitespace; case is preserved.
const squash = (s) => s.replace(/\s+/g, " ").trim();

const requiredName = (label, max) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .transform(squash)
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`));

// "YYYY-MM-DD" -> Date (UTC midnight)
export const calendarDate = (label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a date (YYYY-MM-DD)` })
    .trim()
    .refine((v) => parseCalendarDate(v) !== null, `${label} must be a valid date (YYYY-MM-DD)`)
    .transform((v) => parseCalendarDate(v));

// Optional-field policy: omitted = unchanged/default; "" or null = "no value".
const nullableDate = (label) => z.preprocess((v) => (v === "" ? null : v), calendarDate(label).nullable());

const isHttpUrl = (v) => {
  try {
    const { protocol } = new URL(v);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const jobUrl = z.preprocess(
  (v) => (v === null ? "" : v),
  z
    .string({ invalid_type_error: "Job URL must be text" })
    .trim()
    .max(LIMITS.jobUrl, `Job URL must be at most ${LIMITS.jobUrl} characters`)
    .refine((v) => v === "" || isHttpUrl(v), "Job URL must be a valid http:// or https:// link"),
);

const notes = z.preprocess(
  (v) => (v === null ? "" : v),
  z
    .string({ invalid_type_error: "Notes must be text" })
    .trim()
    .max(LIMITS.notes, `Notes must be at most ${LIMITS.notes} characters`),
);

const status = z.enum(APPLICATION_STATUSES, {
  errorMap: () => ({ message: `Status must be one of: ${APPLICATION_STATUSES.join(", ")}` }),
});

// .strict(): unknown or protected keys (userId, _id, createdAt, ...) are rejected, not silently dropped.
export const createApplicationSchema = z
  .object({
    company: requiredName("Company", LIMITS.company),
    role: requiredName("Job title", LIMITS.role),
    applicationDate: calendarDate("Application date"),
    deadline: nullableDate("Deadline").optional(),
    status: status.optional(),
    jobUrl: jobUrl.optional(),
    notes: notes.optional(),
  })
  .strict();

export const updateApplicationSchema = z
  .object({
    company: requiredName("Company", LIMITS.company).optional(),
    role: requiredName("Job title", LIMITS.role).optional(),
    applicationDate: calendarDate("Application date").optional(),
    deadline: nullableDate("Deadline").optional(),
    status: status.optional(),
    jobUrl: jobUrl.optional(),
    notes: notes.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "Provide at least one field to update.", path: ["_form"] });

// ---- list query -----------------------------------------------------------------------------
export const unset = (schema) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const statusList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => [
    ...new Set(
      (Array.isArray(v) ? v : [v])
        .flatMap((s) => s.split(","))
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(status));

export const wholeNumber = (label) =>
  z.coerce.number({ invalid_type_error: `${label} must be a whole number` }).int(`${label} must be a whole number`);

export const listApplicationsQuerySchema = z
  .object({
    search: unset(
      z
        .string({ invalid_type_error: "Search must be text" })
        .transform(squash)
        .pipe(z.string().max(LIMITS.search, `Search must be at most ${LIMITS.search} characters`)),
    ),
    status: unset(statusList),
    applicationDateFrom: unset(calendarDate("Application date from")),
    applicationDateTo: unset(calendarDate("Application date to")),
    deadlineFrom: unset(calendarDate("Deadline from")),
    deadlineTo: unset(calendarDate("Deadline to")),
    sortBy: unset(
      z.enum(SORT_FIELDS, { errorMap: () => ({ message: `sortBy must be one of: ${SORT_FIELDS.join(", ")}` }) }),
    ),
    sortOrder: unset(z.enum(["asc", "desc"], { errorMap: () => ({ message: "sortOrder must be asc or desc" }) })),
    page: unset(wholeNumber("Page").min(1, "Page must be at least 1").max(LIMITS.maxPage, `Page must be at most ${LIMITS.maxPage}`)),
    limit: unset(wholeNumber("Limit").min(1, "Limit must be at least 1").max(LIMITS.maxLimit, `Limit must be at most ${LIMITS.maxLimit}`)),
  })
  .strict() // unknown params (e.g. a typo like "staus") are a 400, not silently ignored
  .superRefine((q, ctx) => {
    const check = (from, to, key, label) => {
      if (from && to && from.getTime() > to.getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${label} end date must not be before the start date` });
      }
    };
    check(q.applicationDateFrom, q.applicationDateTo, "applicationDateTo", "Application date");
    check(q.deadlineFrom, q.deadlineTo, "deadlineTo", "Deadline");
  })
  .transform((q) => {
    const sortBy = q.sortBy ?? "applicationDate";
    return {
      search: q.search || "",
      status: q.status ?? [],
      applicationDateFrom: q.applicationDateFrom,
      applicationDateTo: q.applicationDateTo,
      deadlineFrom: q.deadlineFrom,
      deadlineTo: q.deadlineTo,
      sortBy,
      sortOrder: q.sortOrder ?? DEFAULT_SORT_ORDER[sortBy],
      page: q.page ?? 1,
      limit: q.limit ?? LIMITS.defaultLimit,
    };
  });
