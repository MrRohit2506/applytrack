// Analytics definitions (see README "Analytics definitions"). All dates are calendar dates (UTC midnight).
import { APPLICATION_STATUSES } from "../constants/applicationStatus.js";
import { addDays, formatCalendarDate, parseCalendarDate } from "../utils/dates.js";

export const GROUP_BY = Object.freeze(["day", "week", "month"]);
export const MAX_TIMELINE_BUCKETS = 400;

export class TooManyBucketsError extends Error {}

/** First day of the day/ISO-week (Monday)/month containing `dateStr`, as "YYYY-MM-DD". */
export function bucketStart(dateStr, groupBy) {
  if (groupBy === "day") return dateStr;
  const d = parseCalendarDate(dateStr);
  if (groupBy === "month") return `${dateStr.slice(0, 7)}-01`;
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return formatCalendarDate(addDays(d, -sinceMonday));
}

export function nextBucket(startStr, groupBy) {
  const d = parseCalendarDate(startStr);
  if (groupBy === "day") return formatCalendarDate(addDays(d, 1));
  if (groupBy === "week") return formatCalendarDate(addDays(d, 7));
  return formatCalendarDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

/** Adds zero-count buckets so the time axis is continuous. rows: [{period, count}] sorted ascending. */
export function fillTimeline(rows, groupBy, { from, to } = {}) {
  if (rows.length === 0) return [];
  const counts = new Map(rows.map((r) => [r.period, r.count]));
  let cursor = from ? bucketStart(from, groupBy) : rows[0].period;
  const end = to ? bucketStart(to, groupBy) : rows[rows.length - 1].period;
  const out = [];
  while (cursor <= end) {
    out.push({ period: cursor, count: counts.get(cursor) ?? 0 });
    if (out.length > MAX_TIMELINE_BUCKETS) throw new TooManyBucketsError();
    cursor = nextBucket(cursor, groupBy);
  }
  return out;
}

/** [{_id:"Offer", n:2}] -> { Applied:0, Interview:0, Offer:2, ... } (always all five statuses). */
export function normaliseStatusCounts(groups) {
  const out = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
  for (const g of groups) if (g._id in out) out[g._id] = g.n;
  return out;
}

/**
 * Rates. The status field only records the CURRENT status (no history), so every rate is a
 * snapshot of where applications stand now.
 *   denominator       = total - Withdrawn   (withdrawn applications never got an employer decision)
 *   responseRate      = (Interview + Offer + Rejected) / denominator   "moved beyond Applied"
 *   interviewRate     = (Interview + Offer) / denominator              "currently at interview stage or later"
 *   offerRate         = Offer / denominator
 * With a zero denominator `percent` is null (the UI shows "not enough data", never 0%).
 */
export function computeRates(byStatus) {
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const denominator = total - byStatus.Withdrawn;
  const rate = (numerator) => ({
    numerator,
    denominator,
    percent: denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null,
  });
  return {
    denominator,
    excludedWithdrawn: byStatus.Withdrawn,
    responseRate: rate(byStatus.Interview + byStatus.Offer + byStatus.Rejected),
    interviewRate: rate(byStatus.Interview + byStatus.Offer),
    offerRate: rate(byStatus.Offer),
  };
}

export function buildScopedPipeline(match, groupBy) {
  const unit = { date: "$applicationDate", unit: groupBy, timezone: "UTC", ...(groupBy === "week" ? { startOfWeek: "monday" } : {}) };
  return [
    { $match: match },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
        timeline: [{ $group: { _id: { $dateTrunc: unit }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      },
    },
  ];
}

/** Applications with applicationDate in the last 7 / 30 days, today included (future dates excluded). */
export function buildRecentPipeline(userId, today) {
  const d7 = addDays(today, -6);
  return [
    { $match: { userId, applicationDate: { $gte: addDays(today, -29), $lte: today } } },
    { $group: { _id: null, last30Days: { $sum: 1 }, last7Days: { $sum: { $cond: [{ $gte: ["$applicationDate", d7] }, 1, 0] } } } },
  ];
}
