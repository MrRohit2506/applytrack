// Reusable API client. All requests send cookies (credentials: "include"); no token is ever
// stored in localStorage/sessionStorage. Unsafe methods carry the CSRF token in a header.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN", fieldErrors = {} } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

let csrfToken = null; // in-memory only
let csrfPromise = null;
let onUnauthorized = null;

export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export function resetCsrfToken() {
  csrfToken = null;
  csrfPromise = null;
}

async function rawFetch(path, options) {
  try {
    return await fetch(`${BASE_URL}${path}`, options);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("Unable to reach the server. Check your connection and try again.", {
      code: "NETWORK_ERROR",
    });
  }
}

async function parseBody(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function getCsrfToken() {
  if (csrfToken) return Promise.resolve(csrfToken);
  csrfPromise ??= (async () => {
    const res = await rawFetch("/auth/csrf", { credentials: "include", headers: { Accept: "application/json" } });
    const body = await parseBody(res);
    if (!res.ok || !body?.data?.csrfToken) {
      throw new ApiError("Could not start a secure session. Please try again.", {
        status: res.status,
        code: "CSRF_UNAVAILABLE",
      });
    }
    csrfToken = body.data.csrfToken;
    return csrfToken;
  })().finally(() => {
    csrfPromise = null;
  });
  return csrfPromise;
}

/** Builds "?a=1&b=2"; skips empty values; arrays become repeated params (status=A&status=B). */
export function buildQuery(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else if (value !== undefined && value !== null && value !== "") params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function apiRequest(path, { method = "GET", body, text, query, signal, _retried = false } = {}) {
  const unsafe = !["GET", "HEAD"].includes(method);
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (text !== undefined) headers["Content-Type"] = "text/csv"; // raw CSV upload
  if (unsafe) headers["X-CSRF-Token"] = await getCsrfToken();

  const res = await rawFetch(`${path}${buildQuery(query)}`, {
    method,
    headers,
    credentials: "include",
    signal,
    body: text !== undefined ? text : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await parseBody(res);
  if (res.ok) return payload?.data ?? null;

  const err = payload?.error;
  if (res.status === 403 && err?.code === "CSRF_INVALID" && !_retried) {
    resetCsrfToken(); // token/cookie expired: fetch a fresh one and retry once
    return apiRequest(path, { method, body, text, query, signal, _retried: true });
  }
  // A 401 on a non-auth endpoint means the session expired mid-use.
  if (res.status === 401 && !path.startsWith("/auth/")) onUnauthorized?.();

  throw new ApiError(err?.message || `Request failed (${res.status}).`, {
    status: res.status,
    code: err?.code || "HTTP_ERROR",
    fieldErrors: err?.fieldErrors || {},
  });
}

/** GET a file (e.g. the CSV export) with the session cookie. Resolves { blob, count } (count from X-Record-Count or null). */
export async function apiDownload(path, { signal } = {}) {
  const res = await rawFetch(path, { method: "GET", credentials: "include", signal, headers: { Accept: "text/csv" } });
  if (!res.ok) {
    const err = (await parseBody(res))?.error;
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(err?.message || `Download failed (${res.status}).`, { status: res.status, code: err?.code || "HTTP_ERROR" });
  }
  const header = res.headers.get("X-Record-Count");
  return { blob: await res.blob(), count: header !== null && Number.isFinite(Number(header)) ? Number(header) : null };
}

export const api = {
  getMe: (opts) => apiRequest("/auth/me", opts),
  register: (body) => apiRequest("/auth/register", { method: "POST", body }),
  login: (body) => apiRequest("/auth/login", { method: "POST", body }),
  logout: () => apiRequest("/auth/logout", { method: "POST", body: {} }),

  applications: {
    /** filters: { search, status[], applicationDateFrom/To, deadlineFrom/To, sortBy, sortOrder, page, limit } */
    list: (filters, opts = {}) => apiRequest("/applications", { ...opts, query: filters }),
    get: (id, opts = {}) => apiRequest(`/applications/${encodeURIComponent(id)}`, opts),
    create: (body) => apiRequest("/applications", { method: "POST", body }),
    update: (id, body) => apiRequest(`/applications/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    remove: (id) => apiRequest(`/applications/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Downloads ALL of the user's applications as CSV. */
    exportCsv: (opts) => apiDownload("/applications/export", opts),
    /** Sends raw CSV text. commit=false validates only (preview); commit=true imports. */
    importCsv: (text, { commit = false, duplicates = "skip" } = {}) =>
      apiRequest("/applications/import", { method: "POST", text, query: { commit: commit ? "true" : "false", duplicates } }),
  },

  analytics: {
    /** params: { from, to, groupBy, windowDays, today } */
    overview: (params, opts = {}) => apiRequest("/analytics/overview", { ...opts, query: params }),
  },

  reminders: {
    /** params: { windowDays, today } */
    list: (params, opts = {}) => apiRequest("/reminders", { ...opts, query: params }),
  },
};
