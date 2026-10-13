import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../context/AuthContext.jsx";
import { apiRequest, resetCsrfToken, setUnauthorizedHandler } from "../lib/apiClient.js";
import { USER, installFakeApi } from "./fakeApi.js";

let ctx;
function Probe() {
  ctx = useAuth();
  return (
    <div>
      <p data-testid="status">{ctx.status}</p>
      <p data-testid="email">{ctx.user?.email ?? ""}</p>
      <p data-testid="notice">{ctx.notice ?? ""}</p>
      <p data-testid="error">{ctx.error ?? ""}</p>
    </div>
  );
}
const status = () => screen.getByTestId("status").textContent;
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  resetCsrfToken();
  setUnauthorizedHandler(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("AuthProvider (real API client, stubbed network)", () => {
  it("starts in 'loading' and then restores an existing session", async () => {
    installFakeApi({ "GET /auth/me": { body: { data: { user: USER } } } });
    mount();
    expect(status()).toBe("loading"); // never 'unauthenticated' before the server answered
    await waitFor(() => expect(status()).toBe("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("ada@example.com");
  });

  it("becomes 'unauthenticated' on 401", async () => {
    installFakeApi({ "GET /auth/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Authentication required." } } } });
    mount();
    await waitFor(() => expect(status()).toBe("unauthenticated"));
  });

  it("reports a network failure as 'error' (not as logged out) and can retry", async () => {
    const api = installFakeApi({ "GET /auth/me": { networkError: true } });
    mount();
    await waitFor(() => expect(status()).toBe("error"));
    expect(screen.getByTestId("error")).toHaveTextContent(/unable to reach the server/i);
    api.handlers["GET /auth/me"] = { body: { data: { user: USER } } };
    await act(async () => ctx.retry());
    await waitFor(() => expect(status()).toBe("authenticated"));
  });

  it("login stores the user from the server; failed login leaves the user logged out", async () => {
    const api = installFakeApi({
      "GET /auth/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } },
      "POST /auth/login": { status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } } },
    });
    mount();
    await waitFor(() => expect(status()).toBe("unauthenticated"));
    await expect(ctx.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ status: 401 });
    expect(status()).toBe("unauthenticated");
    api.handlers["POST /auth/login"] = { body: { data: { user: USER } } };
    await act(async () => ctx.login({ email: "ada@example.com", password: "Sup3rSecret!" }));
    expect(status()).toBe("authenticated");
    expect(localStorage.length).toBe(0); // no token in web storage
    expect(sessionStorage.length).toBe(0);
  });

  it("logout clears the user only after the server confirmed", async () => {
    const api = installFakeApi({
      "GET /auth/me": { body: { data: { user: USER } } },
      "POST /auth/logout": { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } } },
    });
    mount();
    await waitFor(() => expect(status()).toBe("authenticated"));
    await expect(ctx.logout()).rejects.toMatchObject({ status: 500 });
    expect(status()).toBe("authenticated"); // failure: still signed in, error surfaced to the caller
    api.handlers["POST /auth/logout"] = { body: { data: { message: "Logged out." } } };
    await act(async () => ctx.logout());
    expect(status()).toBe("unauthenticated");
    expect(screen.getByTestId("email")).toHaveTextContent("");
  });

  it("an expired session mid-use returns to 'unauthenticated' with a notice", async () => {
    installFakeApi({
      "GET /auth/me": { body: { data: { user: USER } } },
      "GET /applications": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "Authentication required." } } },
    });
    mount();
    await waitFor(() => expect(status()).toBe("authenticated"));
    await expect(apiRequest("/applications")).rejects.toMatchObject({ status: 401 });
    await waitFor(() => expect(status()).toBe("unauthenticated"));
    expect(screen.getByTestId("notice")).toHaveTextContent("Your session has expired");
  });

  it("a stale CSRF token is refreshed transparently once", async () => {
    let first = true;
    const api = installFakeApi({
      "GET /auth/me": { body: { data: { user: USER } } },
      "POST /auth/logout": () => {
        if (first) {
          first = false;
          return { status: 403, body: { error: { code: "CSRF_INVALID", message: "Missing or invalid CSRF token." } } };
        }
        return { body: { data: { message: "Logged out." } } };
      },
    });
    mount();
    await waitFor(() => expect(status()).toBe("authenticated"));
    await act(async () => ctx.logout());
    expect(status()).toBe("unauthenticated");
    expect(api.calls.filter((c) => c === "GET /auth/csrf").length).toBe(2); // fetched again after the 403
  });
});
