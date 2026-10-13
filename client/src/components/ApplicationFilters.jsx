import { APPLICATION_STATUSES, DEFAULT_SORT_ORDER, SORT_OPTIONS } from "../lib/applicationConstants.js";
import FormField from "./FormField.jsx";
import { SelectField } from "./FormControls.jsx";

const chip = (on) =>
  `rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
    on ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
  }`;

export default function ApplicationFilters({
  searchInput,
  onSearchInput,
  filters,
  rangeErrors,
  onToggleStatus,
  onFilter,
  onSort,
  onClear,
  hasActiveFilters,
}) {
  return (
    <section aria-label="Search and filters" className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <FormField
        id="search"
        label="Search company or job title"
        type="search"
        placeholder="e.g. Acme or Frontend"
        autoComplete="off"
        maxLength={100}
        value={searchInput}
        onChange={(e) => onSearchInput(e.target.value)}
      />

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Status</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {APPLICATION_STATUSES.map((s) => {
            const on = filters.status.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => onToggleStatus(s)} className={chip(on)}>
                {s}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="applicationDateFrom" label="Applied from" type="date" value={filters.applicationDateFrom} onChange={(e) => onFilter({ applicationDateFrom: e.target.value })} />
        <FormField id="applicationDateTo" label="Applied to" type="date" value={filters.applicationDateTo} onChange={(e) => onFilter({ applicationDateTo: e.target.value })} error={rangeErrors.applicationDateTo} />
        <FormField id="deadlineFrom" label="Deadline from" type="date" value={filters.deadlineFrom} onChange={(e) => onFilter({ deadlineFrom: e.target.value })} />
        <FormField id="deadlineTo" label="Deadline to" type="date" value={filters.deadlineTo} onChange={(e) => onFilter({ deadlineTo: e.target.value })} error={rangeErrors.deadlineTo} />
      </div>
      <p className="-mt-2 text-xs text-slate-500">Date ranges include both end dates. A deadline filter only matches applications that have a deadline.</p>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-52">
          <SelectField
            id="sortBy"
            label="Sort by"
            value={filters.sortBy}
            onChange={(e) => onSort({ sortBy: e.target.value, sortOrder: DEFAULT_SORT_ORDER[e.target.value] })}
            options={SORT_OPTIONS}
          />
        </div>
        <div className="w-full sm:w-44">
          <SelectField
            id="sortOrder"
            label="Order"
            value={filters.sortOrder}
            onChange={(e) => onSort({ sortOrder: e.target.value })}
            options={[
              { value: "asc", label: "Ascending" },
              { value: "desc", label: "Descending" },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasActiveFilters && !searchInput}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear filters
        </button>
      </div>
    </section>
  );
}
