export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const formatPercent = (p) => (p === null || p === undefined ? "—" : `${p}%`);

/** "2026-03-01" + groupBy -> "Mar 2026" / "Mar 1" / "Week of Mar 1" (UTC parts, no timezone shift). */
export function formatPeriod(period, groupBy) {
  const [y, m, d] = period.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const opts = groupBy === "month" ? { month: "short", year: "numeric" } : { month: "short", day: "numeric" };
  const label = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: "UTC" }).format(date);
  return groupBy === "week" ? `Week of ${label}` : label;
}

export function deadlineLabel(category, daysUntil) {
  if (category === "overdue") return `Overdue by ${plural(-daysUntil, "day")}`;
  if (category === "dueToday") return "Due today";
  return daysUntil === 1 ? "Due tomorrow" : `Due in ${daysUntil} days`;
}
