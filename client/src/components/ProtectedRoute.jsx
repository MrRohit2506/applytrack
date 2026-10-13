import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ConnectionProblem from "./ConnectionProblem.jsx";
import FullPageSpinner from "./FullPageSpinner.jsx";

/** Renders nothing private until the server has confirmed who the user is. */
export default function ProtectedRoute() {
  const { status, error, notice, retry } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageSpinner label="Checking your session…" />;
  if (status === "error") return <ConnectionProblem message={error} onRetry={retry} />;
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location, notice }} />;
  }
  return <Outlet />;
}
