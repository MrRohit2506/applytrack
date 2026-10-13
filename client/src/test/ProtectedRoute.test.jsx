import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import PublicOnlyRoute from "../components/PublicOnlyRoute.jsx";
import { AuthContext } from "../context/AuthContext.jsx";

function renderAt(path, auth) {
  const value = { user: null, error: null, notice: null, retry: () => {}, ...auth };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<div>Login page</div>} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Secret dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("shows a loading state and no private content while auth is unresolved", () => {
    renderAt("/dashboard", { status: "loading" });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users to /login", () => {
    renderAt("/dashboard", { status: "unauthenticated" });
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  });

  it("renders private content for authenticated users", () => {
    renderAt("/dashboard", { status: "authenticated", user: { name: "Ada" } });
    expect(screen.getByText("Secret dashboard")).toBeInTheDocument();
  });

  it("offers a retry when the server is unreachable instead of redirecting", () => {
    renderAt("/dashboard", { status: "error", error: "Unable to reach the server." });
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });
});

describe("PublicOnlyRoute", () => {
  it("sends authenticated users away from /login", () => {
    renderAt("/login", { status: "authenticated", user: { name: "Ada" } });
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("shows the login page to unauthenticated users", () => {
    renderAt("/login", { status: "unauthenticated" });
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });
});
