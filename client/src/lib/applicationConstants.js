// Mirror of server/src/constants/applicationStatus.js (the API is authoritative; keep in sync).
export const APPLICATION_STATUSES = ["Applied", "Interview", "Offer", "Rejected", "Withdrawn"];

export const SORT_OPTIONS = [
  { value: "applicationDate", label: "Application date" },
  { value: "deadline", label: "Deadline" },
  { value: "company", label: "Company" },
  { value: "status", label: "Status" },
];

export const DEFAULT_SORT_ORDER = { applicationDate: "desc", deadline: "asc", company: "asc", status: "asc" };
export const PAGE_SIZES = [10, 25, 50];
export const FIELD_LIMITS = { company: 120, role: 120, jobUrl: 2048, notes: 2000 };

// Colour is never the only signal: badges always carry the status text.
export const STATUS_STYLES = {
  Applied: "bg-blue-50 text-blue-800 ring-blue-200",
  Interview: "bg-amber-50 text-amber-900 ring-amber-200",
  Offer: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Rejected: "bg-red-50 text-red-800 ring-red-200",
  Withdrawn: "bg-slate-100 text-slate-700 ring-slate-300",
};
