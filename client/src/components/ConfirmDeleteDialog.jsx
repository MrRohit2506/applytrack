import { useRef, useState } from "react";
import Alert from "./Alert.jsx";
import Modal from "./Modal.jsx";

/** Destructive-action confirmation. `onConfirm()` must reject on failure so the error is shown here. */
export default function ConfirmDeleteDialog({ application, onConfirm, onCancel }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const busy = useRef(false);

  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.message || "Could not delete the application. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Modal title="Delete application?" onClose={onCancel} dismissable={!pending}>
      <div className="mt-3 space-y-4">
        <p className="text-sm text-slate-700">
          This will permanently delete your application for <strong>{application.role}</strong> at{" "}
          <strong>{application.company}</strong>. This can't be undone.
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-autofocus
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
