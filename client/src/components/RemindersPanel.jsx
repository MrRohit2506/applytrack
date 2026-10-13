import { Link } from "react-router-dom";
import { formatCalendarDate } from "../lib/dates.js";
import { plural } from "../lib/format.js";
import Alert from "./Alert.jsx";
import DeadlineBadge from "./DeadlineBadge.jsx";
import StatusBadge from "./StatusBadge.jsx";

/**
 * In-app deadline reminders (nothing is emailed or pushed). Shows overdue, due-today and upcoming
 * deadlines of pending (Applied/Interview) applications.
 */
export default function RemindersPanel({ data, loading, error, onRetry }) {
  let body;
  if (error) {
    body = (
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <button type="button" onClick={onRetry} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
          Try again
        </button>
      </div>
    );
  } else if (!data) {
    body = (
      <p role="status" className="text-sm text-slate-600">
        Loading reminders…
      </p>
    );
  } else if (data.reminders.length === 0) {
    body = <p className="text-sm text-slate-600">Nothing needs attention. No pending applications are overdue or due in the next {plural(data.windowDays, "day")}.</p>;
  } else {
    body = (
      <>
        <p className="mb-3 text-sm text-slate-600">
          {data.counts.overdue} overdue · {data.counts.dueToday} due today · {data.counts.upcoming} upcoming (next {plural(data.windowDays, "day")})
        </p>
        <ul className="divide-y divide-slate-100">
          {data.reminders.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="break-words font-medium text-slate-900">{r.company}</p>
                <p className="break-words text-sm text-slate-600">{r.role}</p>
                <p className="mt-1 text-xs text-slate-500">Deadline {formatCalendarDate(r.deadline)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeadlineBadge category={r.category} daysUntil={r.daysUntil} />
                <StatusBadge status={r.status} />
                <Link
                  to={`/applications?edit=${encodeURIComponent(r.id)}`}
                  aria-label={`Open ${r.company} – ${r.role}`}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
        {data.truncated && <p className="mt-2 text-xs text-slate-500">Showing the {data.reminders.length} earliest of {data.counts.total} reminders.</p>}
      </>
    );
  }

  return (
    <section aria-labelledby="reminders-heading" aria-busy={loading} className={`rounded-xl bg-white p-5 ring-1 ring-slate-200 ${loading && data ? "opacity-70" : ""}`}>
      <h2 id="reminders-heading" className="text-lg font-semibold text-slate-900">
        Deadline reminders
      </h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}
