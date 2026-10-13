import { useState } from "react";
import { formatPeriod, plural } from "../lib/format.js";

const W = 640;
const H = 220;
const PAD = { left: 36, right: 8, top: 12, bottom: 34 };

/**
 * Applications submitted per period (bars). Hover/focus shows the value; a data table below the chart
 * is the keyboard/screen-reader alternative. Only real counts are drawn.
 */
export default function ActivityChart({ timeline, groupBy }) {
  const [active, setActive] = useState(null);
  const n = timeline.length;
  const max = Math.max(1, ...timeline.map((t) => t.count));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(40, slot * 0.7));
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const y = (v) => PAD.top + innerH - (v / max) * innerH;
  const total = timeline.reduce((a, t) => a + t.count, 0);
  const label = (t) => formatPeriod(t.period, groupBy);

  return (
    <figure aria-label="Applications over time">
      <figcaption className="sr-only">
        {plural(total, "application")} across {plural(n, groupBy)}. A data table follows the chart.
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Bar chart: ${plural(total, "application")} per ${groupBy}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#475569">
              {v}
            </text>
          </g>
        ))}
        {timeline.map((t, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const h = (t.count / max) * innerH;
          return (
            <g key={t.period}>
              <rect
                x={x}
                y={PAD.top + innerH - h}
                width={barW}
                height={Math.max(h, t.count > 0 ? 1 : 0)}
                rx="2"
                fill={active === i ? "#4338ca" : "#6366f1"}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${label(t)}: ${plural(t.count, "application")}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 12} textAnchor="middle" fontSize="11" fill="#475569">
                  {groupBy === "month" ? formatPeriod(t.period, "month").split(" ")[0] : label(t).replace("Week of ", "")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 min-h-5 text-sm text-slate-600">
        {active !== null ? `${label(timeline[active])}: ${plural(timeline[active].count, "application")}` : "Hover over a bar for details. Each bar counts applications submitted in that period."}
      </p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">View as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg ring-1 ring-slate-200">
          <table className="min-w-full text-left">
            <caption className="sr-only">Applications per {groupBy}</caption>
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2">Period</th>
                <th scope="col" className="px-3 py-2 text-right">Applications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timeline.map((t) => (
                <tr key={t.period}>
                  <th scope="row" className="px-3 py-1.5 font-normal text-slate-700">{label(t)}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
