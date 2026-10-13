import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ActivityChart from "../components/ActivityChart.jsx";
import Alert from "../components/Alert.jsx";
import FormField from "../components/FormField.jsx";
import { SelectField } from "../components/FormControls.jsx";
import MetricCard, { RateCard } from "../components/MetricCard.jsx";
import PageHeader, { buttonPrimary, buttonSecondary } from "../components/PageHeader.jsx";
import StatusDistributionChart from "../components/StatusDistributionChart.jsx";
import { useFetch } from "../hooks/useFetch.js";
import { api } from "../lib/apiClient.js";
import { todayISO } from "../lib/dates.js";
import { plural } from "../lib/format.js";

const card = "rounded-xl bg-white p-5 ring-1 ring-slate-200";

function Definitions() {
  return (
    <details className={card}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">How these numbers are calculated</summary>
      <dl className="mt-3 space-y-3 text-sm text-slate-700">
        <div>
          <dt className="font-medium">Current status, not history</dt>
          <dd>ApplyTrack stores each application's <em>current</em> status, not when it changed. Rates are therefore a snapshot of where applications stand today. For example, an application that had an interview and was then rejected counts as Rejected, so the interview rate can understate how many interviews you got.</dd>
        </div>
        <div>
          <dt className="font-medium">Denominator</dt>
          <dd>Rates divide by all applications <em>except Withdrawn</em> (withdrawing is your decision, not an employer response). If that number is zero, rates show "—" instead of 0%.</dd>
        </div>
        <div>
          <dt className="font-medium">Response rate</dt>
          <dd>(Interview + Offer + Rejected) ÷ denominator: applications that moved beyond Applied.</dd>
        </div>
        <div>
          <dt className="font-medium">Interview rate</dt>
          <dd>(Interview + Offer) ÷ denominator: applications currently at the interview stage or later.</dd>
        </div>
        <div>
          <dt className="font-medium">Offer rate</dt>
          <dd>Offer ÷ denominator.</dd>
        </div>
        <div>
          <dt className="font-medium">Deadlines</dt>
          <dd>Only applications still pending (Applied or Interview) with a deadline count. Overdue = before today; due today; upcoming = within the reminder window. The date range above does not affect these, or the recent-activity counts.</dd>
        </div>
        <div>
          <dt className="font-medium">Not available</dt>
          <dd>Time-to-response and interview dates would need response dates or a status history, which ApplyTrack does not record yet.</dd>
        </div>
      </dl>
    </details>
  );
}

export default function AnalyticsPage() {
  const [groupBy, setGroupBy] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rangeError = from && to && from > to ? "End date must not be before the start date" : null;

  const params = useMemo(() => ({ groupBy, from, to }), [groupBy, from, to]);
  const { data, loading, error, reload } = useFetch(
    (signal) => api.analytics.overview({ ...params, today: todayISO() }, { signal }),
    [params],
    { enabled: !rangeError },
  );
  const filtered = Boolean(from || to);

  let body;
  if (error) {
    body = (
      <div role="alert" className={`${card} text-center`}>
        <h2 className="text-lg font-semibold text-slate-900">We couldn't load your analytics</h2>
        <p className="mt-1 text-sm text-slate-600">{error}</p>
        <button type="button" onClick={reload} className={`${buttonPrimary} mt-4`}>Try again</button>
      </div>
    );
  } else if (!data) {
    body = (
      <p role="status" className={`${card} text-center text-sm text-slate-600`}>
        Loading analytics…
      </p>
    );
  } else if (data.totals.total === 0) {
    body = filtered ? (
      <div className={`${card} text-center`}>
        <h2 className="text-lg font-semibold text-slate-900">No applications in this date range</h2>
        <p className="mt-1 text-sm text-slate-600">Try a wider range or clear the dates.</p>
        <button type="button" className={`${buttonSecondary} mt-4`} onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>
      </div>
    ) : (
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 className="text-lg font-semibold text-slate-900">No data to analyse yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">Add applications (or import a CSV) and your statistics will appear here.</p>
        <Link to="/applications" className={`${buttonPrimary} mt-4 inline-block`}>Go to applications</Link>
      </div>
    );
  } else {
    const { totals, rates, timeline, deadlines, recent, scope } = data;
    body = (
      <div aria-busy={loading} className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Total applications" value={totals.total} hint={filtered ? "In the selected range" : "All time"} />
          <MetricCard label="Interviews" value={totals.interviewCount} hint="Currently at Interview" />
          <MetricCard label="Offers" value={totals.offerCount} hint="Currently at Offer" tone="success" />
          <MetricCard label="Overdue deadlines" value={deadlines.overdue} hint="Pending applications past their deadline" tone={deadlines.overdue > 0 ? "danger" : "default"} />
        </section>

        <section aria-label="Rates" className="grid gap-4 md:grid-cols-3">
          <RateCard label="Response rate" rate={rates.responseRate} definition="Moved beyond Applied." />
          <RateCard label="Interview rate" rate={rates.interviewRate} definition="At Interview or Offer now." />
          <RateCard label="Offer rate" rate={rates.offerRate} definition="Currently at Offer." />
        </section>
        {rates.excludedWithdrawn > 0 && <p className="-mt-3 text-xs text-slate-500">{plural(rates.excludedWithdrawn, "withdrawn application")} excluded from the rate calculations.</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={card} aria-labelledby="status-heading">
            <h2 id="status-heading" className="mb-4 text-lg font-semibold text-slate-900">Status distribution</h2>
            <StatusDistributionChart byStatus={totals.byStatus} total={totals.total} />
          </section>
          <section className={card} aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="mb-4 text-lg font-semibold text-slate-900">Applications over time</h2>
            <ActivityChart timeline={timeline} groupBy={scope.groupBy} />
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={card} aria-labelledby="deadlines-heading">
            <h2 id="deadlines-heading" className="text-lg font-semibold text-slate-900">Deadlines</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div><dt className="text-xs text-slate-600">Overdue</dt><dd className="text-2xl font-semibold text-red-700">{deadlines.overdue}</dd></div>
              <div><dt className="text-xs text-slate-600">Due today</dt><dd className="text-2xl font-semibold text-amber-700">{deadlines.dueToday}</dd></div>
              <div><dt className="text-xs text-slate-600">Next {deadlines.windowDays} days</dt><dd className="text-2xl font-semibold text-blue-700">{deadlines.upcoming}</dd></div>
            </dl>
            <p className="mt-3 text-sm"><Link to="/dashboard" className="font-medium text-indigo-700 underline-offset-2 hover:underline">See the reminders on your dashboard</Link></p>
          </section>
          <section className={card} aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="text-lg font-semibold text-slate-900">Recent activity</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div><dt className="text-xs text-slate-600">Applied in the last 7 days</dt><dd className="text-2xl font-semibold text-slate-900">{recent.last7Days}</dd></div>
              <div><dt className="text-xs text-slate-600">Applied in the last 30 days</dt><dd className="text-2xl font-semibold text-slate-900">{recent.last30Days}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Statistics calculated from your own applications. Every figure comes from your saved records." />

      <section aria-label="Analytics options" className="grid gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <SelectField id="groupBy" label="Group over time by" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        <FormField id="from" label="Applied from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <FormField id="to" label="Applied to" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={rangeError} />
        <button type="button" className={buttonSecondary} disabled={!filtered} onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>
      </section>
      {rangeError && <Alert tone="info">Fix the date range to refresh the numbers.</Alert>}

      {body}
      <Definitions />
    </div>
  );
}
