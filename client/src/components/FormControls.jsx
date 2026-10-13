const base =
  "mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100";
const ok = "border-slate-300 focus:border-indigo-600 focus:ring-indigo-200";
const bad = "border-red-500 focus:border-red-500 focus:ring-red-200";

function Wrapper({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id, error, hint) =>
  [hint && !error && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

export function SelectField({ id, label, error, hint, options, ...rest }) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <select id={id} name={id} aria-invalid={error ? "true" : "false"} aria-describedby={describedBy(id, error, hint)} className={`${base} ${error ? bad : ok}`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function TextAreaField({ id, label, error, hint, ...rest }) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <textarea id={id} name={id} rows={4} aria-invalid={error ? "true" : "false"} aria-describedby={describedBy(id, error, hint)} className={`${base} ${error ? bad : ok}`} {...rest} />
    </Wrapper>
  );
}
