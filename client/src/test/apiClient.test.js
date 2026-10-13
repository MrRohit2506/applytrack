import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, apiDownload, apiRequest, buildQuery, resetCsrfToken, setUnauthorizedHandler } from "../lib/apiClient.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  resetCsrfToken();
  setUnauthorizedHandler(null);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("apiClient", () => {
  it("sends credentials and the CSRF header on POST, and never touches web storage", async () => {
    fetch
      .mockResolvedValueOnce(json(200, { data: { csrfToken: "tok" } }))
      .mockResolvedValueOnce(json(201, { data: { user: { id: "1" } } }));
    const data = await api.register({ name: "A", email: "a@b.co", password: "abcdefg1" });
    expect(data.user.id).toBe("1");

    const [url, opts] = fetch.mock.calls[1];
    expect(url).toBe("/api/auth/register");
    expect(opts.credentials).toBe("include");
    expect(opts.headers["X-CSRF-Token"]).toBe("tok");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("sends credentials on GET without needing a CSRF token", async () => {
    fetch.mockResolvedValueOnce(json(200, { data: { user: { id: "1" } } }));
    await api.getMe();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
  });

  it("refreshes the CSRF token and retries once on CSRF_INVALID", async () => {
    fetch
      .mockResolvedValueOnce(json(200, { data: { csrfToken: "old" } }))
      .mockResolvedValueOnce(json(403, { error: { code: "CSRF_INVALID", message: "bad" } }))
      .mockResolvedValueOnce(json(200, { data: { csrfToken: "new" } }))
      .mockResolvedValueOnce(json(200, { data: { user: { id: "1" } } }));
    await api.login({ email: "a@b.co", password: "x" });
    expect(fetch.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("new");
  });

  it("maps server errors to ApiError with field errors", async () => {
    fetch
      .mockResolvedValueOnce(json(200, { data: { csrfToken: "t" } }))
      .mockResolvedValueOnce(json(409, { error: { code: "EMAIL_TAKEN", message: "taken", fieldErrors: { email: "taken" } } }));
    await expect(api.register({})).rejects.toMatchObject({ status: 409, code: "EMAIL_TAKEN", fieldErrors: { email: "taken" } });
  });

  it("maps network failures to a friendly ApiError", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await api.getMe().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("does not trigger the expired-session handler for /auth/* 401s", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetch.mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "no" } }));
    await expect(api.getMe()).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("triggers the expired-session handler for a 401 on other endpoints", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetch.mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "no" } }));
    await expect(apiRequest("/applications")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("buildQuery skips empty values and repeats array params", () => {
    expect(buildQuery({ search: "", status: ["Offer", "Applied"], page: 2, x: undefined, y: null })).toBe("?status=Offer&status=Applied&page=2");
    expect(buildQuery({})).toBe("");
  });

  it("applications.list sends a credentialed GET with the query string and no CSRF round-trip", async () => {
    fetch.mockResolvedValueOnce(json(200, { data: { applications: [], pagination: {} } }));
    await api.applications.list({ status: ["Offer"], search: "acme", page: 3, limit: 10 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("/api/applications?status=Offer&search=acme&page=3&limit=10");
    expect(opts.method).toBe("GET");
    expect(opts.credentials).toBe("include");
    expect(opts.headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("applications.update uses PATCH and remove uses DELETE, both with credentials and CSRF", async () => {
    fetch
      .mockResolvedValueOnce(json(200, { data: { csrfToken: "tok" } }))
      .mockResolvedValueOnce(json(200, { data: { application: {} } }))
      .mockResolvedValueOnce(json(200, { data: { id: "abc/1", message: "ok" } }));
    await api.applications.update("abc", { status: "Offer" });
    await api.applications.remove("abc/1");
    const [uUrl, uOpts] = fetch.mock.calls[1];
    expect(uUrl).toBe("/api/applications/abc");
    expect(uOpts).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(uOpts.headers["X-CSRF-Token"]).toBe("tok");
    expect(JSON.parse(uOpts.body)).toEqual({ status: "Offer" });
    const [dUrl, dOpts] = fetch.mock.calls[2];
    expect(dUrl).toBe("/api/applications/abc%2F1"); // ids are URL-encoded
    expect(dOpts).toMatchObject({ method: "DELETE", credentials: "include" });
    expect(dOpts.headers["X-CSRF-Token"]).toBe("tok");
    expect(dOpts.body).toBeUndefined();
  });

  it("importCsv sends the raw text as text/csv with CSRF and the commit/duplicates query", async () => {
    fetch
      .mockResolvedValueOnce(json(200, { data: { csrfToken: "tok" } }))
      .mockResolvedValueOnce(json(200, { data: { committed: true } }));
    await api.applications.importCsv("company,role\nA,B\n", { commit: true, duplicates: "import" });
    const [url, opts] = fetch.mock.calls[1];
    expect(url).toBe("/api/applications/import?commit=true&duplicates=import");
    expect(opts).toMatchObject({ method: "POST", credentials: "include", body: "company,role\nA,B\n" });
    expect(opts.headers["Content-Type"]).toBe("text/csv");
    expect(opts.headers["X-CSRF-Token"]).toBe("tok");
  });

  it("importCsv defaults to a preview (commit=false)", async () => {
    fetch.mockResolvedValueOnce(json(200, { data: { csrfToken: "t" } })).mockResolvedValueOnce(json(200, { data: {} }));
    await api.applications.importCsv("x");
    expect(fetch.mock.calls[1][0]).toBe("/api/applications/import?commit=false&duplicates=skip");
  });

  it("analytics and reminders build their query strings", async () => {
    fetch.mockResolvedValue(json(200, { data: {} }));
    await api.analytics.overview({ groupBy: "week", from: "", to: "2026-03-01", today: "2026-03-10" });
    await api.reminders.list({ windowDays: 14, today: "2026-03-10" });
    expect(fetch.mock.calls[0][0]).toBe("/api/analytics/overview?groupBy=week&to=2026-03-01&today=2026-03-10");
    expect(fetch.mock.calls[1][0]).toBe("/api/reminders?windowDays=14&today=2026-03-10");
  });

  it("apiDownload returns the blob and record count, sending credentials", async () => {
    fetch.mockResolvedValueOnce(new Response("a,b\r\n", { status: 200, headers: { "Content-Type": "text/csv", "X-Record-Count": "7" } }));
    const { blob, count } = await apiDownload("/applications/export");
    expect(count).toBe(7);
    expect(await blob.text()).toBe("a,b\r\n");
    expect(fetch.mock.calls[0][0]).toBe("/api/applications/export");
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
  });

  it("apiDownload maps errors and reports an expired session", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetch.mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required." } }));
    await expect(apiDownload("/applications/export")).rejects.toMatchObject({ status: 401, message: "Authentication required." });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

