export default function FullPageSpinner({ label = "Loading…" }) {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" aria-hidden="true" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
