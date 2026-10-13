import { formatCalendarDate } from "../lib/dates.js";
import ApplicationRowActions, { isHttpLink } from "./ApplicationRowActions.jsx";
import StatusBadge from "./StatusBadge.jsx";

/** Mobile layout (below md): one card per application with the same essentials and actions. */
export default function ApplicationCards({ applications, onEdit, onDelete }) {
  return (
    <ul className="space-y-3 md:hidden" aria-label="Your job applications">
      {applications.map((a) => (
        <li key={a.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words font-semibold text-slate-900">{a.company}</p>
              <p className="break-words text-sm text-slate-600">{a.role}</p>
            </div>
            <StatusBadge status={a.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Applied</dt>
              <dd className="text-slate-800">{formatCalendarDate(a.applicationDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Deadline</dt>
              <dd className="text-slate-800">{formatCalendarDate(a.deadline)}</dd>
            </div>
          </dl>
          {isHttpLink(a.jobUrl) && (
            <a href={a.jobUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-indigo-700 underline-offset-2 hover:underline">
              Job posting<span className="sr-only"> for {a.company} (opens in a new tab)</span>
            </a>
          )}
          <div className="mt-3">
            <ApplicationRowActions application={a} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </li>
      ))}
    </ul>
  );
}
