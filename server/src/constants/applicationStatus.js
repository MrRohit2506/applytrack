// Single source of truth (server side) for application lifecycle statuses and sorting.
// The client keeps a mirror in client/src/lib/applicationConstants.js; the API is authoritative.
export const APPLICATION_STATUSES = Object.freeze(["Applied", "Interview", "Offer", "Rejected", "Withdrawn"]);

// Deadlines only matter while an application is still pending an outcome. Offer/Rejected/Withdrawn
// applications are excluded from reminders and deadline counts.
export const ACTIVE_DEADLINE_STATUSES = Object.freeze(["Applied", "Interview"]);

export const SORT_FIELDS = Object.freeze(["applicationDate", "deadline", "company", "status"]);

// Default direction when `sortOrder` is not supplied.
export const DEFAULT_SORT_ORDER = Object.freeze({
  applicationDate: "desc", // newest first
  deadline: "asc", // soonest first
  company: "asc",
  status: "asc",
});
