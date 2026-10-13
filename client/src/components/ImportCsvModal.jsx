import { useRef, useState } from "react";
import { api } from "../lib/apiClient.js";
import { readFileText, saveBlob } from "../lib/download.js";
import { plural } from "../lib/format.js";
import Alert from "./Alert.jsx";
import Modal from "./Modal.jsx";

const MAX_CLIENT_BYTES = 10 * 1024 * 1024; // sanity guard only; the server enforces the real limit
const btnPrimary =
  "rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const btnSecondary =
  "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:cursor-not-allowed disabled:opacity-60";

const TEMPLATE = "company,role,applicationDate,deadline,status,jobUrl,notes\r\nAcme Corp,Frontend Engineer,2026-03-05,2026-04-01,Applied,https://example.com/jobs/123,Referred by a friend\r\n";

const errorText = (errors) => Object.entries(errors).map(([field, msg]) => (field === "_row" ? msg : `${field}: ${msg}`)).join(" · ");

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function RowErrors({ report }) {
  if (report.errors.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">Rows with problems (not imported)</h3>
      <ul className="mt-2 max-h-48 space-y-1 overflow-auto rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
        {report.errors.map((e) => (
          <li key={e.row}>
            <strong>Row {e.row}:</strong> {errorText(e.errors)}
          </li>
        ))}
      </ul>
      {report.errorsTruncated && <p className="mt-1 text-xs text-slate-500">Showing the first {report.errors.length} of {report.invalidRows} rows with problems.</p>}
    </div>
  );
}

/**
 * Three steps: choose a file -> preview (server-side validation, nothing written) -> confirm.
 * The CSV text is re-sent on confirm; the server re-validates everything.
 */
export default function ImportCsvModal({ onClose, onImported }) {
  const [step, setStep] = useState("choose"); // choose | preview | result
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [policy, setPolicy] = useState("skip");
  const [report, setReport] = useState(null);
  const lock = useRef(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file || lock.current) return;
    setError(null);
    if (file.size > MAX_CLIENT_BYTES) return setError("That file is too large to import.");
    lock.current = true;
    setBusy(true);
    try {
      const text = await readFileText(file);
      const preview = await api.applications.importCsv(text, { commit: false, duplicates: policy });
      setCsv(text);
      setFileName(file.name);
      setReport(preview);
      setStep("preview");
    } catch (err) {
      setError(err?.message || "The file could not be checked.");
    } finally {
      lock.current = false;
      setBusy(false);
      e.target.value = ""; // allow re-selecting the same file after fixing it
    }
  }

  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.applications.importCsv(csv, { commit: true, duplicates: policy });
      setReport(result);
      setStep("result");
    } catch (err) {
      setError(err?.message || "The import failed. Nothing is reported as imported; check your applications list and try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const willImport = report ? report.validRows - (policy === "skip" ? report.duplicateRows : 0) : 0;
  const done = () => {
    if (report?.committed && report.imported > 0) onImported(report);
    onClose();
  };

  return (
    <Modal title="Import applications from CSV" onClose={step === "result" ? done : onClose} dismissable={!busy}>
      <div className="mt-4 space-y-4">
        {error && <Alert>{error}</Alert>}

        {step === "choose" && (
          <>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                The first row must be a header. <strong>Required columns:</strong> <code>company</code>, <code>role</code>, <code>applicationDate</code> (YYYY-MM-DD).{" "}
                <strong>Optional:</strong> <code>deadline</code> (YYYY-MM-DD), <code>status</code> (Applied, Interview, Offer, Rejected or Withdrawn; blank = Applied), <code>jobUrl</code> (http/https), <code>notes</code>.
              </p>
              <p>Other columns are ignored. Nothing is saved until you review the preview and confirm. Rows that repeat an existing company + role + date are flagged as possible duplicates.</p>
              <button type="button" className="font-medium text-indigo-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" onClick={() => saveBlob(new Blob([TEMPLATE], { type: "text/csv" }), "applytrack-import-template.csv")}>
                Download a template
              </button>
            </div>
            <div>
              <label htmlFor="csv-file" className="block text-sm font-medium text-slate-700">CSV file</label>
              <input id="csv-file" type="file" accept=".csv,text/csv" data-autofocus onChange={onFile} disabled={busy} className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-medium file:text-indigo-700" />
              {busy && (
                <p role="status" className="mt-2 text-sm text-slate-600">
                  Checking file…
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
            </div>
          </>
        )}

        {step === "preview" && report && (
          <>
            <p className="text-sm text-slate-700">
              Preview of <strong>{fileName}</strong>. Nothing has been imported yet.
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Rows in file" value={report.totalRows} />
              <Stat label="Valid" value={report.validRows} />
              <Stat label="With problems" value={report.invalidRows} />
              <Stat label="Possible duplicates" value={report.duplicateRows} />
            </dl>
            {report.ignoredColumns.length > 0 && <Alert tone="info">Ignored columns: {report.ignoredColumns.join(", ")}.</Alert>}

            {report.duplicateRows > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">Possible duplicates ({report.duplicateRows})</legend>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="policy" value="skip" checked={policy === "skip"} onChange={() => setPolicy("skip")} /> Skip them (recommended)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="policy" value="import" checked={policy === "import"} onChange={() => setPolicy("import")} /> Import them anyway
                  </label>
                </div>
                <ul className="mt-2 max-h-32 overflow-auto text-xs text-slate-600">
                  {report.duplicates.map((d) => (
                    <li key={d.row}>Row {d.row}: {d.company} · {d.role} · {d.applicationDate} ({d.reason === "existing" ? "already in your list" : "repeated in this file"})</li>
                  ))}
                </ul>
              </fieldset>
            )}

            <RowErrors report={report} />

            {report.preview.length > 0 && (
              <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
                <table className="min-w-full text-left text-xs">
                  <caption className="bg-slate-50 px-3 py-2 text-left font-medium text-slate-700">First {report.preview.length} rows to import</caption>
                  <tbody className="divide-y divide-slate-100">
                    {report.preview.map((p) => (
                      <tr key={p.row}>
                        <td className="px-3 py-1.5">Row {p.row}</td>
                        <td className="px-3 py-1.5 font-medium">{p.company}</td>
                        <td className="px-3 py-1.5">{p.role}</td>
                        <td className="px-3 py-1.5">{p.applicationDate}</td>
                        <td className="px-3 py-1.5">{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} disabled={busy} onClick={() => { setStep("choose"); setReport(null); setError(null); }}>
                Choose a different file
              </button>
              <button type="button" className={btnPrimary} disabled={busy || willImport === 0} onClick={confirm}>
                {busy ? "Importing…" : willImport === 0 ? "Nothing to import" : `Import ${plural(willImport, "application")}`}
              </button>
            </div>
          </>
        )}

        {step === "result" && report && (
          <>
            <div role="status" className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">
                {report.outcome === "completed" && `Imported ${plural(report.imported, "application")}`}
                {report.outcome === "nothing-to-import" && "Nothing was imported"}
                {report.outcome === "partial" && `Partly imported: ${report.imported} saved, ${report.failedWrites} not saved`}
                {report.outcome === "failed" && "Import failed: nothing was saved"}
              </h3>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Imported" value={report.imported} />
              <Stat label="Skipped duplicates" value={report.skippedDuplicates} />
              <Stat label="Rejected rows" value={report.rejected} />
              <Stat label="Not saved (errors)" value={report.failedWrites} />
            </dl>
            {report.dbErrors.length > 0 && (
              <Alert>
                A database problem stopped part of the import (rows {report.dbErrors.map((d) => `${d.fromRow}–${d.toRow}`).join(", ")}).
                {report.notAttempted > 0 && ` ${plural(report.notAttempted, "row")} were not attempted.`} Check your applications list, then re-run the import: duplicates are skipped by default, so rows that were saved won't be added twice.
              </Alert>
            )}
            <RowErrors report={report} />
            <div className="flex justify-end">
              <button type="button" className={btnPrimary} onClick={done}>Done</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
