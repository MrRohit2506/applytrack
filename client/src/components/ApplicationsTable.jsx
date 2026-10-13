import { formatCalendarDate } from "../lib/dates.js";
import ApplicationRowActions, { isHttpLink } from "./ApplicationRowActions.jsx";
import StatusBadge from "./StatusBadge.jsx";

/** Desktop layout (md and up). Mobile uses ApplicationCards. */
export default function ApplicationsTable({ applications, onEdit, onDelete }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 md:block">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <caption className="sr-only">Your job applications</caption>
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">Company</th>
            <th scope="col" className="px-4 py-3">Job title</th>
            <th scope="col" className="px-4 py-3">Applied</th>
            <th scope="col" className="px-4 py-3">Deadline</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {applications.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3 font-medium text-slate-900">
                {a.company}
                {isHttpLink(a.jobUrl) && (
                  <a href={a.jobUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs font-normal text-indigo-700 underline-offset-2 hover:underline">
                    Job posting<span className="sr-only"> for {a.company} (opens in a new tab)</span>
                  </a>
                )}
              </td>
              <td className="px-4 py-3 text-slate-700">{a.role}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatCalendarDate(a.applicationDate)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatCalendarDate(a.deadline)}</td>
              <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
              <td className="px-4 py-3"><ApplicationRowActions application={a} onEdit={onEdit} onDelete={onDelete} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
