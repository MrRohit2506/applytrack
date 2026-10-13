export default function ConnectionProblem({ message, onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200" role="alert">
        <h1 className="text-lg font-semibold text-slate-900">We couldn't reach the server</h1>
        <p className="mt-2 text-sm text-slate-600">{message || "Please check your connection and try again."}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
