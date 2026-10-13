import { Application } from "../models/Application.js";
import {
  buildRecentPipeline,
  buildScopedPipeline,
  computeRates,
  fillTimeline,
  normaliseStatusCounts,
  TooManyBucketsError,
} from "../services/analytics.js";
import { buildDeadlineCountsPipeline, buildReminderPipeline, countsFromGroups, toReminder } from "../services/deadlines.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatCalendarDate } from "../utils/dates.js";

/**
 * GET /api/analytics/overview
 * Three aggregations run in parallel, all starting with { userId } from the verified session:
 *   1. scoped ($facet): status counts + timeline, limited by from/to (applicationDate, inclusive)
 *   2. deadline counts for pending applications (NOT limited by from/to)
 *   3. recent activity (last 7 / 30 days, NOT limited by from/to)
 */
export const getOverview = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const userId = req.user._id;

  const match = { userId };
  if (q.from || q.to) {
    match.applicationDate = {};
    if (q.from) match.applicationDate.$gte = q.from;
    if (q.to) match.applicationDate.$lte = q.to;
  }

  const [[scoped], deadlineGroups, [recent]] = await Promise.all([
    Application.aggregate(buildScopedPipeline(match, q.groupBy)),
    Application.aggregate(buildDeadlineCountsPipeline(userId, q.today, q.windowDays)),
    Application.aggregate(buildRecentPipeline(userId, q.today)),
  ]);

  const byStatus = normaliseStatusCounts(scoped.byStatus);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  let timeline;
  try {
    timeline = fillTimeline(
      scoped.timeline.map((t) => ({ period: formatCalendarDate(t._id), count: t.n })),
      q.groupBy,
      { from: q.from && formatCalendarDate(q.from), to: q.to && formatCalendarDate(q.to) },
    );
  } catch (err) {
    if (err instanceof TooManyBucketsError) {
      throw new AppError(400, "VALIDATION_ERROR", "Too many time periods. Use a coarser grouping or a narrower date range.", {
        groupBy: "Too many periods for this grouping",
      });
    }
    throw err;
  }

  res.json({
    data: {
      scope: {
        from: q.from ? formatCalendarDate(q.from) : null,
        to: q.to ? formatCalendarDate(q.to) : null,
        groupBy: q.groupBy,
        today: formatCalendarDate(q.today),
        windowDays: q.windowDays,
      },
      totals: { total, byStatus, interviewCount: byStatus.Interview, offerCount: byStatus.Offer },
      rates: computeRates(byStatus),
      timeline,
      deadlines: { ...countsFromGroups(deadlineGroups), windowDays: q.windowDays },
      recent: { last7Days: recent?.last7Days ?? 0, last30Days: recent?.last30Days ?? 0 },
    },
  });
});

/** GET /api/reminders: pending applications whose deadline is overdue, today, or within the window. */
export const listReminders = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const todayStr = formatCalendarDate(q.today);
  const [result] = await Application.aggregate(buildReminderPipeline(req.user._id, q.today, q.windowDays));

  const counts = countsFromGroups(result.counts);
  const total = counts.overdue + counts.dueToday + counts.upcoming;
  const reminders = result.items.map((d) => toReminder(d, todayStr, q.windowDays));
  res.json({ data: { today: todayStr, windowDays: q.windowDays, counts: { ...counts, total }, reminders, truncated: total > reminders.length } });
});
