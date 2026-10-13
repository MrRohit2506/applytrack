import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api, resetCsrfToken, setUnauthorizedHandler } from "../lib/apiClient.js";

export const AuthContext = createContext(null);

// status: "loading" (initial check) | "authenticated" | "unauthenticated" | "error" (server unreachable)
const initial = { status: "loading", user: null, error: null, notice: null };

export function AuthProvider({ children }) {
  const [state, setState] = useState(initial);

  const bootstrap = useCallback(async (signal) => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const data = await api.getMe({ signal });
      setState({ status: "authenticated", user: data.user, error: null, notice: null });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err instanceof ApiError && err.status === 401) {
        setState({ status: "unauthenticated", user: null, error: null, notice: null });
      } else {
        const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
        setState({ status: "error", user: null, error: message, notice: null });
      }
    }
  }, []);

  // Restore the session on startup (and after a page refresh).
  useEffect(() => {
    const controller = new AbortController();
    bootstrap(controller.signal);
    return () => controller.abort();
  }, [bootstrap]);

  // Session expired while using the app -> back to unauthenticated with a notice.
  useEffect(() => {
    setUnauthorizedHandler(() =>
      setState((s) =>
        s.status === "authenticated"
          ? { status: "unauthenticated", user: null, error: null, notice: "Your session has expired. Please sign in again." }
          : s,
      ),
    );
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await api.login(credentials);
    setState({ status: "authenticated", user: data.user, error: null, notice: null });
  }, []);

  const register = useCallback(async (details) => {
    const data = await api.register(details);
    setState({ status: "authenticated", user: data.user, error: null, notice: null });
  }, []);

  // Local state is cleared only after the server confirmed logout; failures propagate to the UI.
  const logout = useCallback(async () => {
    await api.logout();
    resetCsrfToken();
    setState({ status: "unauthenticated", user: null, error: null, notice: null });
  }, []);

  const retry = useCallback(() => bootstrap(), [bootstrap]);

  const value = useMemo(() => ({ ...state, login, register, logout, retry }), [state, login, register, logout, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
