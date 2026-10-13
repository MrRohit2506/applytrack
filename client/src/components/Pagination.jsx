import { PAGE_SIZES } from "../lib/applicationConstants.js";

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";

export default function Pagination({ pagination, onPage, onLimit }) {
  const { page, limit, totalPages } = pagination;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <label htmlFor="page-size">Rows per page</label>
        <select
          id="page-size"
          value={limit}
          onChange={(e) => onLimit(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span className="text-sm text-slate-600" aria-live="polite">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </nav>
  );
}
