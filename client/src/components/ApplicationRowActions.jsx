const btn =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600";

export default function ApplicationRowActions({ application, onEdit, onDelete }) {
  const label = `${application.company} – ${application.role}`;
  return (
    <div className="flex gap-2">
      <button type="button" className={btn} onClick={() => onEdit(application)} aria-label={`Edit ${label}`}>
        Edit
      </button>
      <button
        type="button"
        className={`${btn} border-red-200 text-red-700 hover:bg-red-50`}
        onClick={() => onDelete(application)}
        aria-label={`Delete ${label}`}
      >
        Delete
      </button>
    </div>
  );
}

export const isHttpLink = (u) => /^https?:\/\//i.test(u || "");
