const TONES = {
  default: "text-slate-900",
  danger: "text-red-700",
  warning: "text-amber-700",
  success: "text-emerald-700",
};

/** One headline number with a label and a plain-language hint. */
export default function MetricCard({ label, value, hint, tone = "default" }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${TONES[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** A rate: shows "—" and an explanation (never 0%) when there is nothing to divide by. */
export function RateCard({ label, rate, definition }) {
  const available = rate.percent !== null;
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{available ? `${rate.percent}%` : "—"}</p>
      <p className="mt-1 text-xs text-slate-500">
        {available ? `${rate.numerator} of ${rate.denominator} applications. ` : "Not enough data yet: needs at least one application that isn't withdrawn. "}
        {definition}
      </p>
    </div>
  );
}
