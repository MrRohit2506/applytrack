// Calendar-date policy: applicationDate/deadline are CALENDAR DATES, not instants.
//  - API wire format is always "YYYY-MM-DD".
//  - Stored in MongoDB as a Date at 00:00:00 UTC of that day.
//  - Serialised back with the UTC date parts, so server/browser timezones never shift the day.
//  - Range filters are inclusive on both ends (>= from 00:00Z, <= to 00:00Z).
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns a Date (UTC midnight) or null if the string is not a real calendar date in 1900-2100. */
export function parseCalendarDate(value) {
  if (typeof value !== "string") return null;
  const m = RE.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** Date -> "YYYY-MM-DD" using UTC parts. */
export function formatCalendarDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

const DAY_MS = 86400000;

/** Today's calendar date in UTC, "YYYY-MM-DD" (fallback when a client does not send its own `today`). */
export const todayCalendarDate = () => formatCalendarDate(new Date());

/** Returns a NEW Date shifted by whole days (UTC). */
export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Whole days from one "YYYY-MM-DD" to another (positive when `to` is later). */
export const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
