import { APPLICATION_STATUSES, FIELD_LIMITS } from "./applicationConstants.js";
import { isValidCalendarDate } from "./dates.js";

export const squash = (s) => s.replace(/\s+/g, " ").trim();

function isHttpUrl(v) {
  try {
    const { protocol } = new URL(v);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Usability-only mirror of the server rules; the server remains the authority.
export function validateApplicationForm(v) {
  const e = {};
  const company = squash(v.company);
  if (!company) e.company = "Company is required";
  else if (company.length > FIELD_LIMITS.company) e.company = `Company must be at most ${FIELD_LIMITS.company} characters`;

  const role = squash(v.role);
  if (!role) e.role = "Job title is required";
  else if (role.length > FIELD_LIMITS.role) e.role = `Job title must be at most ${FIELD_LIMITS.role} characters`;

  if (!v.applicationDate) e.applicationDate = "Application date is required";
  else if (!isValidCalendarDate(v.applicationDate)) e.applicationDate = "Enter a valid date";

  if (v.deadline && !isValidCalendarDate(v.deadline)) e.deadline = "Enter a valid date";

  if (!APPLICATION_STATUSES.includes(v.status)) e.status = "Choose a status";

  const url = v.jobUrl.trim();
  if (url.length > FIELD_LIMITS.jobUrl) e.jobUrl = `Job URL must be at most ${FIELD_LIMITS.jobUrl} characters`;
  else if (url && !isHttpUrl(url)) e.jobUrl = "Enter a valid http:// or https:// link";

  if (v.notes.trim().length > FIELD_LIMITS.notes) e.notes = `Notes must be at most ${FIELD_LIMITS.notes} characters`;
  return e;
}

/** Inclusive range check on YYYY-MM-DD strings (lexicographic order == chronological order). */
export function validateDateRanges(f) {
  const e = {};
  if (f.applicationDateFrom && f.applicationDateTo && f.applicationDateFrom > f.applicationDateTo) {
    e.applicationDateTo = "End date must not be before the start date";
  }
  if (f.deadlineFrom && f.deadlineTo && f.deadlineFrom > f.deadlineTo) {
    e.deadlineTo = "End date must not be before the start date";
  }
  return e;
}
