// Pure helpers (no DB access) that turn a validated list query into MongoDB filter/sort/pipeline.
import { formatCalendarDate } from "../utils/dates.js";

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const range = (from, to) => {
  const r = {};
  if (from) r.$gte = from; // inclusive
  if (to) r.$lte = to; // inclusive
  return Object.keys(r).length ? r : undefined;
};

/** Every filter starts with userId: search, filters, sort, pagination and counts are all ownership-scoped. */
export function buildFilter(userId, q) {
  const filter = { userId };
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), "i"); // user input is escaped: literal substring match
    filter.$or = [{ company: re }, { role: re }];
  }
  if (q.status?.length) filter.status = q.status.length === 1 ? q.status[0] : { $in: q.status };
  const appRange = range(q.applicationDateFrom, q.applicationDateTo);
  if (appRange) filter.applicationDate = appRange;
  // Records without a deadline never match an active deadline filter (null is outside any range).
  const dueRange = range(q.deadlineFrom, q.deadlineTo);
  if (dueRange) filter.deadline = dueRange;
  return filter;
}

/** Allowlisted field + deterministic tie-break (_id desc) so pagination is stable. */
export function buildSort(q) {
  return { [q.sortBy]: q.sortOrder === "asc" ? 1 : -1, _id: -1 };
}

/** Deadline sort keeps records WITHOUT a deadline last in both directions. */
export function buildDeadlinePipeline(filter, q, skip) {
  return [
    { $match: filter },
    { $addFields: { _noDeadline: { $cond: [{ $eq: [{ $ifNull: ["$deadline", null] }, null] }, 1, 0] } } },
    { $sort: { _noDeadline: 1, deadline: q.sortOrder === "asc" ? 1 : -1, _id: -1 } },
    { $skip: skip },
    { $limit: q.limit },
  ];
}

export const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit), // 0 when there are no matches
});

/** Public representation. userId is intentionally omitted; dates are "YYYY-MM-DD". */
export function serializeApplication(a) {
  return {
    id: String(a._id),
    company: a.company,
    role: a.role,
    applicationDate: formatCalendarDate(a.applicationDate),
    deadline: a.deadline ? formatCalendarDate(a.deadline) : null,
    status: a.status,
    jobUrl: a.jobUrl ?? "",
    notes: a.notes ?? "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
