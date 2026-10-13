import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ConnectionProblem from "./ConnectionProblem.jsx";
import FullPageSpinner from "./FullPageSpinner.jsx";

/** Login/register: authenticated users are sent to where they were headed (or the dashboard). */
export default function PublicOnlyRoute() {
  const { status, error, retry } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageSpinner label="Checking your session…" />;
  if (status === "error") return <ConnectionProblem message={error} onRetry={retry} />;
  if (status === "authenticated") {
    return <Navigate to={location.state?.from?.pathname || "/dashboard"} replace />;
  }
  return <Outlet />;
}
