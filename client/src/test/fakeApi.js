import { vi } from "vitest";

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Stubs global fetch with a tiny route table so the REAL apiClient, AuthProvider, router and pages run together.
 * handlers: { "GET /auth/me": { status, body } | (opts) => Response | { status, body } }. Mutate it mid-test to change behaviour.
 * Throw/reject by returning { networkError: true }.
 */
export function installFakeApi(handlers) {
  const calls = [];
  const fn = vi.fn(async (url, opts = {}) => {
    const path = String(url).replace(/^\/api/, "").split("?")[0];
    const key = `${opts.method || "GET"} ${path}`;
    calls.push(key);
    if (path === "/auth/csrf") return json(200, { data: { csrfToken: "test-token" } });
    const h = handlers[key];
    if (!h) return json(404, { error: { code: "NOT_FOUND", message: "Resource not found." } });
    const r = typeof h === "function" ? h(opts) : h;
    if (r instanceof Response) return r;
    if (r.networkError) throw new TypeError("Failed to fetch");
    return json(r.status ?? 200, r.body);
  });
  vi.stubGlobal("fetch", fn);
  return { fetch: fn, calls, handlers };
}

export const USER = { id: "u1", name: "Ada", email: "ada@example.com", createdAt: "2026-01-01T00:00:00.000Z" };
export const emptyOverview = {
  scope: { from: null, to: null, groupBy: "month", today: "2026-03-10", windowDays: 7 },
  totals: { total: 0, byStatus: { Applied: 0, Interview: 0, Offer: 0, Rejected: 0, Withdrawn: 0 }, interviewCount: 0, offerCount: 0 },
  rates: {},
  timeline: [],
  deadlines: { overdue: 0, dueToday: 0, upcoming: 0, windowDays: 7 },
  recent: { last7Days: 0, last30Days: 0 },
};
export const emptyReminders = { today: "2026-03-10", windowDays: 7, counts: { overdue: 0, dueToday: 0, upcoming: 0, total: 0 }, reminders: [], truncated: false };
