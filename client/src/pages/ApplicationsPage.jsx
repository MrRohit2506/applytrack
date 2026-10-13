import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ApplicationCards from "../components/ApplicationCards.jsx";
import ApplicationFilters from "../components/ApplicationFilters.jsx";
import ApplicationFormModal from "../components/ApplicationFormModal.jsx";
import ApplicationsTable from "../components/ApplicationsTable.jsx";
import ConfirmDeleteDialog from "../components/ConfirmDeleteDialog.jsx";
import ImportCsvModal from "../components/ImportCsvModal.jsx";
import PageHeader, { buttonSecondary } from "../components/PageHeader.jsx";
import Pagination from "../components/Pagination.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useApplications } from "../hooks/useApplications.js";
import { api } from "../lib/apiClient.js";
import { squash } from "../lib/applicationValidators.js";
import { todayISO } from "../lib/dates.js";
import { plural } from "../lib/format.js";
import { saveBlob } from "../lib/download.js";

const primaryBtn =
  "rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2";

export default function ApplicationsPage({ searchDebounceMs = 300 }) {
  const toast = useToast();
  const list = useApplications();
  const { filters, items, pagination, loading, loaded, error, rangeErrors, hasActiveFilters } = list;

  const [searchInput, setSearchInput] = useState("");
  const [form, setForm] = useState(null); // null | { application: null | app }
  const [deleting, setDeleting] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Deep link from reminders: /applications?edit=<id> opens that application's edit form.
  const [params, setParams] = useSearchParams();
  const editId = params.get("edit");
  useEffect(() => {
    if (!editId) return undefined;
    let live = true;
    api.applications
      .get(editId)
      .then(({ application }) => {
        if (!live) return;
        setForm({ application });
        setParams({}, { replace: true });
      })
      .catch(() => {
        if (!live) return;
        toast.error("That application could not be found.");
        setParams({}, { replace: true });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const { blob, count } = await api.applications.exportCsv();
      saveBlob(blob, `applytrack-applications-${todayISO()}.csv`);
      toast.success(count === 0 ? "You have no applications yet. Downloaded a file with headers only." : count === null ? "Export downloaded." : `Exported ${plural(count, "application")}.`);
    } catch (err) {
      toast.error(err?.message || "The export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  // Debounced search: wait for a pause in typing, then reset to page 1 with the new term.
  useEffect(() => {
    const timer = setTimeout(() => {
      const term = squash(searchInput);
      if (term !== filters.search) list.updateFilters({ search: term });
    }, searchDebounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function clearAll() {
    setSearchInput("");
    list.clearFilters();
  }

  async function saveApplication(payload) {
    const editing = form.application;
    if (editing) await api.applications.update(editing.id, payload);
    else await api.applications.create(payload);
    setForm(null);
    toast.success(editing ? "Application updated." : "Application added.");
    if (editing) list.reload();
    else list.reloadFromStart();
  }

  async function confirmDelete() {
    try {
      await api.applications.remove(deleting.id);
    } catch (err) {
      toast.error(err?.message || "Could not delete the application.");
      throw err; // keeps the dialog open and shows the error inside it
    }
    setDeleting(null);
    toast.success("Application deleted.");
    list.reload(); // if this emptied the page, useApplications moves to the last valid page
  }

  const total = pagination?.total ?? 0;
  const firstShown = total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastShown = total === 0 ? 0 : firstShown + items.length - 1;

  let body;
  if (error) {
    body = (
      <div role="alert" className="rounded-xl bg-white p-8 text-center ring-1 ring-red-200">
        <h2 className="text-lg font-semibold text-slate-900">We couldn't load your applications</h2>
        <p className="mt-1 text-sm text-slate-600">{error}</p>
        <button type="button" onClick={list.reload} className={`${primaryBtn} mt-4`}>
          Try again
        </button>
      </div>
    );
  } else if (!loaded) {
    body = (
      <div role="status" className="flex items-center justify-center gap-3 rounded-xl bg-white p-10 text-sm text-slate-600 ring-1 ring-slate-200">
        <span className="h-5 w-5 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" aria-hidden="true" />
        Loading applications…
      </div>
    );
  } else if (total === 0 && !hasActiveFilters) {
    body = (
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 className="text-lg font-semibold text-slate-900">No applications yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">Add the first job you've applied for to start tracking it.</p>
        <button type="button" onClick={() => setForm({ application: null })} className={`${primaryBtn} mt-4`}>
          Add your first application
        </button>
      </div>
    );
  } else if (total === 0) {
    body = (
      <div className="rounded-xl bg-white p-10 text-center ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">No matching applications</h2>
        <p className="mt-2 text-sm text-slate-600">Nothing matches your current search and filters.</p>
        <button type="button" onClick={clearAll} className={`${primaryBtn} mt-4`}>
          Clear filters
        </button>
      </div>
    );
  } else {
    body = (
      <div aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
        <ApplicationsTable applications={items} onEdit={(a) => setForm({ application: a })} onDelete={setDeleting} />
        <ApplicationCards applications={items} onEdit={(a) => setForm({ application: a })} onDelete={setDeleting} />
        <Pagination pagination={pagination} onPage={list.setPage} onLimit={list.setLimit} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Track every job you've applied for, from first submission to final outcome."
        actions={
          <>
            <button type="button" onClick={exportCsv} disabled={exporting} className={buttonSecondary}>
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <button type="button" onClick={() => setImporting(true)} className={buttonSecondary}>
              Import CSV
            </button>
            <button type="button" onClick={() => setForm({ application: null })} className={primaryBtn}>
              Add application
            </button>
          </>
        }
      />
      <p className="-mt-3 text-xs text-slate-500">Export CSV includes all of your applications, regardless of the filters below.</p>

      <ApplicationFilters
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        filters={filters}
        rangeErrors={rangeErrors}
        onToggleStatus={list.toggleStatus}
        onFilter={list.updateFilters}
        onSort={list.setSort}
        onClear={clearAll}
        hasActiveFilters={hasActiveFilters}
      />

      {loaded && !error && total > 0 && (
        <p className="text-sm text-slate-600" aria-live="polite">
          Showing {firstShown}–{lastShown} of {total} {total === 1 ? "application" : "applications"}
          {loading && <span className="ml-2 text-indigo-700">Updating…</span>}
        </p>
      )}

      {body}

      {form && <ApplicationFormModal application={form.application} onSubmit={saveApplication} onClose={() => setForm(null)} />}
      {importing && (
        <ImportCsvModal
          onClose={() => setImporting(false)}
          onImported={(report) => {
            toast.success(`Imported ${plural(report.imported, "application")}.`);
            list.reloadFromStart();
          }}
        />
      )}
      {deleting && <ConfirmDeleteDialog application={deleting} onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
