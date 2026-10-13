// Deadline reminder logic. Everything is based on CALENDAR dates ("YYYY-MM-DD"), never on clock times,
// so there is no timezone arithmetic. "today" is supplied by the caller (the client's local date, or UTC).
import { ACTIVE_DEADLINE_STATUSES } from "../constants/applicationStatus.js";
import { addDays, daysBetween, formatCalendarDate } from "../utils/dates.js";

export const REMINDER_LIST_LIMIT = 100;

/** category: overdue (deadline < today) | dueToday | upcoming (today < deadline <= today + windowDays) | null */
export function classifyDeadline(deadline, today, windowDays) {
  const daysUntil = daysBetween(today, deadline);
  if (daysUntil < 0) return { category: "overdue", daysUntil };
  if (daysUntil === 0) return { category: "dueToday", daysUntil };
  if (daysUntil <= windowDays) return { category: "upcoming", daysUntil };
  return null;
}

const categoryGroup = (today) => ({
  $group: {
    _id: {
      $cond: [{ $lt: ["$deadline", today] }, "overdue", { $cond: [{ $eq: ["$deadline", today] }, "dueToday", "upcoming"] }],
    },
    n: { $sum: 1 },
  },
});

// Only the owner's pending applications that HAVE a deadline on or before the end of the window.
const matchStage = (userId, today, windowDays) => ({
  $match: {
    userId,
    status: { $in: [...ACTIVE_DEADLINE_STATUSES] },
    deadline: { $ne: null, $lte: addDays(today, windowDays) },
  },
});

export const buildDeadlineCountsPipeline = (userId, today, windowDays) => [
  matchStage(userId, today, windowDays),
  categoryGroup(today),
];

export const buildReminderPipeline = (userId, today, windowDays) => [
  matchStage(userId, today, windowDays),
  {
    $facet: {
      items: [
        { $sort: { deadline: 1, _id: 1 } },
        { $limit: REMINDER_LIST_LIMIT },
        { $project: { company: 1, role: 1, status: 1, deadline: 1, applicationDate: 1 } },
      ],
      counts: [categoryGroup(today)],
    },
  },
];

export function countsFromGroups(groups) {
  const counts = { overdue: 0, dueToday: 0, upcoming: 0 };
  for (const g of groups) if (g._id in counts) counts[g._id] = g.n;
  return counts;
}

export function toReminder(doc, todayStr, windowDays) {
  const deadline = formatCalendarDate(doc.deadline);
  const { category, daysUntil } = classifyDeadline(deadline, todayStr, windowDays);
  return {
    id: String(doc._id),
    company: doc.company,
    role: doc.role,
    status: doc.status,
    applicationDate: formatCalendarDate(doc.applicationDate),
    deadline,
    category,
    daysUntil,
  };
}
