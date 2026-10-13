// Calendar-date policy (matches the server): dates are "YYYY-MM-DD" strings end to end.
// They are never turned into local-time Date objects for display, so timezones cannot shift them.
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");

/** Today's calendar date in the user's local timezone, as YYYY-MM-DD. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidCalendarDate(value) {
  const m = RE.exec(value ?? "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** "2026-03-05" -> localised "Mar 5, 2026" using UTC parts only. Missing -> "—". */
export function formatCalendarDate(value) {
  if (!isValidCalendarDate(value)) return "—";
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
