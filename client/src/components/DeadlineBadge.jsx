import { deadlineLabel } from "../lib/format.js";

const TONES = {
  overdue: "bg-red-50 text-red-800 ring-red-200",
  dueToday: "bg-amber-50 text-amber-900 ring-amber-300",
  upcoming: "bg-blue-50 text-blue-800 ring-blue-200",
};
const ICON = { overdue: "!", dueToday: "•", upcoming: "→" };

/** Text + symbol + colour, so the state never depends on colour alone. */
export default function DeadlineBadge({ category, daysUntil }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[category]}`}>
      <span aria-hidden="true">{ICON[category]}</span>
      {deadlineLabel(category, daysUntil)}
    </span>
  );
}
