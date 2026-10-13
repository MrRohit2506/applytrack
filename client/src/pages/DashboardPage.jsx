import { Link } from "react-router-dom";
import MetricCard from "../components/MetricCard.jsx";
import PageHeader, { buttonPrimary, buttonSecondary } from "../components/PageHeader.jsx";
import RemindersPanel from "../components/RemindersPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { api } from "../lib/apiClient.js";
import { todayISO } from "../lib/dates.js";

// Header/navigation/sign-out live in DashboardLayout. The dashboard summarises real data from the API.
export default function DashboardPage() {
  const { user } = useAuth();
  const stats = useFetch((signal) => api.analytics.overview({ today: todayISO() }, { signal }), []);
  const reminders = useFetch((signal) => api.reminders.list({ today: todayISO() }, { signal }), []);
  const totals = stats.data?.totals;
  const needsAttention = reminders.data ? reminders.data.counts.overdue + reminders.data.counts.dueToday : null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name ?? ""}`}
        description="Where your job search stands today."
        actions={
          <>
            <Link to="/analytics" className={buttonSecondary}>View analytics</Link>
            <Link to="/applications" className={buttonPrimary}>Manage applications</Link>
          </>
        }
      />

      {stats.error ? (
        <div role="alert" className="rounded-xl bg-white p-5 ring-1 ring-red-200">
          <p className="text-sm text-slate-700">We couldn't load your summary: {stats.error}</p>
          <button type="button" onClick={stats.reload} className={`${buttonSecondary} mt-3`}>Try again</button>
        </div>
      ) : (
        <section aria-label="Summary" aria-busy={stats.loading && !totals} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Applications" value={totals ? totals.total : "…"} hint="All time" />
          <MetricCard label="Interviews" value={totals ? totals.interviewCount : "…"} hint="Currently at Interview" />
          <MetricCard label="Offers" value={totals ? totals.offerCount : "…"} hint="Currently at Offer" tone="success" />
          <MetricCard label="Needs attention" value={needsAttention ?? "…"} hint="Overdue or due today" tone={needsAttention > 0 ? "danger" : "default"} />
        </section>
      )}

      {totals?.total === 0 && (
        <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center" aria-labelledby="start-heading">
          <h2 id="start-heading" className="text-lg font-semibold text-slate-900">Add your first application</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">Add one by hand or import a CSV from a spreadsheet, and your statistics and reminders will appear here.</p>
          <Link to="/applications" className={`${buttonPrimary} mt-4 inline-block`}>Go to applications</Link>
        </section>
      )}

      <RemindersPanel data={reminders.data} loading={reminders.loading} error={reminders.error} onRetry={reminders.reload} />
    </>
  );
}
