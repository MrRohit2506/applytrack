import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Alert from "./Alert.jsx";

const link = ({ isActive }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
    isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
  }`;

/** Shared chrome for authenticated pages: header, navigation, sign-out. */
export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState(null);

  async function onLogout() {
    setError(null);
    setLoggingOut(true);
    try {
      await logout();
    } catch (err) {
      setError(err?.message || "Could not sign out. Please try again.");
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-indigo-700 focus:shadow">
        Skip to main content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold tracking-tight text-indigo-700">ApplyTrack</span>
            <nav aria-label="Main" className="flex gap-1">
              <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
              <NavLink to="/applications" className={link}>Applications</NavLink>
              <NavLink to="/analytics" className={link}>Analytics</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={onLogout}
              disabled={loggingOut}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-6 px-4 py-8 focus:outline-none">
        {error && <Alert>{error}</Alert>}
        <Outlet />
      </main>
    </div>
  );
}
