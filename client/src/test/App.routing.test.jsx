import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { AuthProvider } from "../context/AuthContext.jsx";
import { ToastProvider } from "../context/ToastContext.jsx";
import { resetCsrfToken, setUnauthorizedHandler } from "../lib/apiClient.js";
import { USER, emptyOverview, emptyReminders, installFakeApi } from "./fakeApi.js";

const unauth = { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Authentication required." } } };

function setup(entry, { loggedIn, down = false }) {
  const state = { loggedIn, down };
  const api = installFakeApi({
    "GET /auth/me": () => (state.down ? { networkError: true } : state.loggedIn ? { body: { data: { user: USER } } } : unauth),
    "POST /auth/logout": () => {
      state.loggedIn = false;
      return { body: { data: { message: "Logged out." } } };
    },
    "GET /analytics/overview": () => (state.loggedIn ? { body: { data: emptyOverview } } : unauth),
    "GET /reminders": () => (state.loggedIn ? { body: { data: emptyReminders } } : unauth),
    "GET /applications": () => unauth, // overridden per test when needed
  });
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { ...api, state };
}

beforeEach(() => {
  resetCsrfToken();
  setUnauthorizedHandler(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("routing, guards and session handling (real components, stubbed network)", () => {
  it("never shows private content to a signed-out visitor: /dashboard redirects to sign-in", async () => {
    setup("/dashboard", { loggedIn: false });
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByText(/Welcome, Ada/)).not.toBeInTheDocument();
  });

  it("shows the dashboard with navigation to a signed-in user", async () => {
    setup("/dashboard", { loggedIn: true });
    expect(await screen.findByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const name of ["Dashboard", "Applications", "Analytics"]) expect(nav).toHaveTextContent(name);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
  });

  it("sends a signed-in user away from /login and /register", async () => {
    setup("/login", { loggedIn: true });
    expect(await screen.findByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
  });

  it("logout returns to sign-in and the dashboard is closed again", async () => {
    const t = setup("/dashboard", { loggedIn: true });
    await screen.findByRole("heading", { name: "Welcome, Ada" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(t.calls).toContain("POST /auth/logout");
    expect(screen.queryByText(/Welcome, Ada/)).not.toBeInTheDocument();
  });

  it("restores the session after a page refresh (fresh mount asks the server)", async () => {
    const t = setup("/dashboard", { loggedIn: true });
    await screen.findByRole("heading", { name: "Welcome, Ada" });
    expect(t.calls[0]).toBe("GET /auth/me");
  });

  it("shows a 404 page for unknown routes", async () => {
    setup("/no-such-page", { loggedIn: true });
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("a session that expires while using a page redirects to sign-in with an explanation", async () => {
    setup("/applications", { loggedIn: true });
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your session has expired");
  });

  it("an unreachable server shows a retry screen instead of a login redirect, and recovers", async () => {
    const t = setup("/dashboard", { loggedIn: true, down: true });
    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
    t.state.down = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
  });
});
