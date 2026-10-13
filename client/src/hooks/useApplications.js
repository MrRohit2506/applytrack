import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SORT_ORDER } from "../lib/applicationConstants.js";
import { validateDateRanges } from "../lib/applicationValidators.js";
import { api } from "../lib/apiClient.js";

export const DEFAULT_FILTERS = {
  search: "",
  status: [],
  applicationDateFrom: "",
  applicationDateTo: "",
  deadlineFrom: "",
  deadlineTo: "",
  sortBy: "applicationDate",
  sortOrder: DEFAULT_SORT_ORDER.applicationDate,
  page: 1,
  limit: 10,
};

/**
 * Server-driven list state. Every change to filters/sort/page triggers one request.
 *  - Overlapping requests: the previous one is aborted AND a sequence number guards against late
 *    responses, so a slow old response can never overwrite a newer result.
 *  - Filter/sort/page-size changes reset to page 1.
 *  - If the current page no longer exists (e.g. its last item was deleted) the hook jumps to the last page.
 *  - An invalid date range is not sent to the API; the previous results stay on screen.
 */
export function useApplications() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ items: [], pagination: null, loading: true, loaded: false, error: null });
  const seq = useRef(0);

  const rangeErrors = useMemo(() => validateDateRanges(filters), [filters]);
  const invalid = Object.keys(rangeErrors).length > 0;

  useEffect(() => {
    if (invalid) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    const mine = ++seq.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    api.applications
      .list(filters, { signal: controller.signal })
      .then(({ applications, pagination }) => {
        if (mine !== seq.current) return; // superseded
        if (applications.length === 0 && pagination.total > 0 && filters.page > pagination.totalPages) {
          setFilters((f) => ({ ...f, page: Math.max(1, pagination.totalPages) })); // re-run on a valid page
          return;
        }
        setState({ items: applications, pagination, loading: false, loaded: true, error: null });
      })
      .catch((err) => {
        if (err?.name === "AbortError" || mine !== seq.current) return;
        setState((s) => ({ ...s, loading: false, error: err?.message || "Could not load applications." }));
      });

    return () => controller.abort();
  }, [filters, reloadKey, invalid]);

  const updateFilters = useCallback((patch) => setFilters((f) => ({ ...f, ...patch, page: 1 })), []);
  const toggleStatus = useCallback(
    (status) =>
      setFilters((f) => ({
        ...f,
        page: 1,
        status: f.status.includes(status) ? f.status.filter((s) => s !== status) : [...f.status, status],
      })),
    [],
  );
  const setSort = useCallback(
    (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 })),
    [],
  );
  const setPage = useCallback((page) => setFilters((f) => ({ ...f, page })), []);
  const setLimit = useCallback((limit) => setFilters((f) => ({ ...f, limit, page: 1 })), []);
  const clearFilters = useCallback(
    () =>
      setFilters((f) => ({
        ...DEFAULT_FILTERS,
        sortBy: f.sortBy,
        sortOrder: f.sortOrder,
        limit: f.limit,
      })),
    [],
  );
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  /** After creating a record: go to the first page and refetch. */
  const reloadFromStart = useCallback(() => {
    setFilters((f) => (f.page === 1 ? f : { ...f, page: 1 }));
    setReloadKey((k) => k + 1);
  }, []);

  const hasActiveFilters = Boolean(
    filters.search || filters.status.length || filters.applicationDateFrom || filters.applicationDateTo || filters.deadlineFrom || filters.deadlineTo,
  );

  return {
    filters,
    ...state,
    rangeErrors,
    hasActiveFilters,
    updateFilters,
    toggleStatus,
    setSort,
    setPage,
    setLimit,
    clearFilters,
    reload,
    reloadFromStart,
  };
}
