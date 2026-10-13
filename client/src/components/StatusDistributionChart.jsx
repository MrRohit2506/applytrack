import { APPLICATION_STATUSES } from "../lib/applicationConstants.js";

const BAR = { Applied: "bg-blue-500", Interview: "bg-amber-500", Offer: "bg-emerald-500", Rejected: "bg-red-500", Withdrawn: "bg-slate-400" };

/** Horizontal bar chart. The numbers are visible text, so it is readable without seeing the bars. */
export default function StatusDistributionChart({ byStatus, total }) {
  const summary = `${total} ${total === 1 ? "application" : "applications"}: ${APPLICATION_STATUSES.map((s) => `${byStatus[s]} ${s}`).join(", ")}.`;
  return (
    <figure aria-label="Applications by status">
      <figcaption className="sr-only">{summary}</figcaption>
      <ul className="space-y-3">
        {APPLICATION_STATUSES.map((s) => {
          const count = byStatus[s];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <li key={s}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-800">{s}</span>
                <span className="tabular-nums text-slate-600">
                  {count} <span className="text-slate-500">({pct}%)</span>
                </span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className={`h-full rounded-full ${BAR[s]}`} style={{ width: count > 0 ? `${Math.max(pct, 2)}%` : "0%" }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Percentages are each status's share of all applications in the selected range.</p>
    </figure>
  );
}
