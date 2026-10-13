import { useRef, useState } from "react";
import { APPLICATION_STATUSES, FIELD_LIMITS } from "../lib/applicationConstants.js";
import { squash, validateApplicationForm } from "../lib/applicationValidators.js";
import { todayISO } from "../lib/dates.js";
import Alert from "./Alert.jsx";
import FormField from "./FormField.jsx";
import { SelectField, TextAreaField } from "./FormControls.jsx";
import Modal from "./Modal.jsx";
import SubmitButton from "./SubmitButton.jsx";

const initialValues = (a) =>
  a
    ? { company: a.company, role: a.role, applicationDate: a.applicationDate, deadline: a.deadline || "", status: a.status, jobUrl: a.jobUrl || "", notes: a.notes || "" }
    : { company: "", role: "", applicationDate: todayISO(), deadline: "", status: "Applied", jobUrl: "", notes: "" };

const normalise = (v) => ({
  company: squash(v.company),
  role: squash(v.role),
  applicationDate: v.applicationDate,
  deadline: v.deadline || null,
  status: v.status,
  jobUrl: v.jobUrl.trim(),
  notes: v.notes.trim(),
});

const FIELD_ORDER = ["company", "role", "applicationDate", "deadline", "status", "jobUrl", "notes"];

/**
 * Create (application === null) or edit form. `onSubmit(payload)` must reject with an ApiError on
 * failure; the modal then stays open with the user's input intact and shows field/form errors.
 * Edit mode sends only the fields that changed.
 */
export default function ApplicationFormModal({ application, onSubmit, onClose }) {
  const mode = application ? "edit" : "create";
  const [values, setValues] = useState(() => initialValues(application));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // blocks double-submits that happen before React re-renders

  const onChange = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError(null);

    const found = validateApplicationForm(values);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((k) => found[k]);
    if (firstInvalid) return document.getElementById(firstInvalid)?.focus();

    let payload = normalise(values);
    if (mode === "edit") {
      const original = normalise(initialValues(application));
      payload = Object.fromEntries(Object.entries(payload).filter(([k, v]) => v !== original[k]));
      if (Object.keys(payload).length === 0) return onClose(); // nothing changed: no request
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      const { _form, ...fields } = err?.fieldErrors || {};
      setErrors(fields);
      setFormError(_form || err?.message || "Something went wrong. Please try again.");
      const first = FIELD_ORDER.find((k) => fields[k]);
      if (first) document.getElementById(first)?.focus();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal title={mode === "edit" ? "Edit application" : "Add application"} onClose={onClose} dismissable={!submitting}>
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <FormField id="company" label="Company" required maxLength={FIELD_LIMITS.company + 20} autoComplete="organization" data-autofocus value={values.company} onChange={onChange} error={errors.company} disabled={submitting} />
        <FormField id="role" label="Job title" required maxLength={FIELD_LIMITS.role + 20} value={values.role} onChange={onChange} error={errors.role} disabled={submitting} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="applicationDate" label="Application date" type="date" required value={values.applicationDate} onChange={onChange} error={errors.applicationDate} disabled={submitting} />
          <FormField id="deadline" label="Deadline (optional)" type="date" value={values.deadline} onChange={onChange} error={errors.deadline} disabled={submitting} />
        </div>
        <SelectField id="status" label="Status" value={values.status} onChange={onChange} error={errors.status} disabled={submitting} options={APPLICATION_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FormField id="jobUrl" label="Job URL (optional)" type="url" inputMode="url" placeholder="https://" value={values.jobUrl} onChange={onChange} error={errors.jobUrl} disabled={submitting} />
        <TextAreaField id="notes" label="Notes (optional)" value={values.notes} onChange={onChange} error={errors.notes} disabled={submitting} hint={`${values.notes.length}/${FIELD_LIMITS.notes}`} />
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <div className="sm:w-44">
            <SubmitButton loading={submitting} loadingText="Saving…">
              {mode === "edit" ? "Save changes" : "Add application"}
            </SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
