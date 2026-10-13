import { useCallback, useEffect, useState } from "react";

/**
 * Runs `fetcher(signal)` whenever `deps` change (or reload() is called). Aborts superseded requests,
 * ignores late responses, keeps the previous data while refreshing, and surfaces errors.
 * `enabled: false` skips fetching (used for invalid filter input).
 */
export function useFetch(fetcher, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    const controller = new AbortController();
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher(controller.signal)
      .then((data) => live && setState({ data, loading: false, error: null }))
      .catch((err) => {
        if (!live || err?.name === "AbortError") return;
        setState((s) => ({ ...s, loading: false, error: err?.message || "Something went wrong." }));
      });
    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, key, enabled]);

  const reload = useCallback(() => setKey((k) => k + 1), []);
  return { ...state, reload };
}
