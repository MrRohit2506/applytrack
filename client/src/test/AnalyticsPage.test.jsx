import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "../pages/AnalyticsPage.jsx";

vi.mock("../lib/apiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, api: { ...actual.api, analytics: { overview: vi.fn() } } };
});
import { ApiError, api } from "../lib/apiClient.js";

const { overview } = api.analytics;
const zero = { Applied: 0, Interview: 0, Offer: 0, Rejected: 0, Withdrawn: 0 };
const none = { numerator: 0, denominator: 0, percent: null };

const data = (o = {}) => ({
  scope: { from: null, to: null, groupBy: "month", today: "2026-03-10", windowDays: 7 },
  totals: { total: 8, byStatus: { Applied: 3, Interview: 2, Offer: 1, Rejected: 1, Withdrawn: 1 }, interviewCount: 2, offerCount: 1 },
  rates: {
    denominator: 7,
    excludedWithdrawn: 1,
    responseRate: { numerator: 4, denominator: 7, percent: 57.1 },
    interviewRate: { numerator: 3, denominator: 7, percent: 42.9 },
    offerRate: { numerator: 1, denominator: 7, percent: 14.3 },
  },
  timeline: [{ period: "2026-01-01", count: 2 }, { period: "2026-02-01", count: 2 }, { period: "2026-03-01", count: 4 }],
  deadlines: { overdue: 1, dueToday: 1, upcoming: 1, windowDays: 7 },
  recent: { last7Days: 3, last30Days: 5 },
  ...o,
});
const emptyData = () =>
  data({
    totals: { total: 0, byStatus: zero, interviewCount: 0, offerCount: 0 },
    rates: { denominator: 0, excludedWithdrawn: 0, responseRate: none, interviewRate: none, offerRate: none },
    timeline: [],
    deadlines: { overdue: 0, dueToday: 0, upcoming: 0, windowDays: 7 },
    recent: { last7Days: 0, last30Days: 0 },
  });

const renderPage = () => render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
const lastParams = () => overview.mock.calls[overview.mock.calls.length - 1][0];

beforeEach(() => vi.resetAllMocks());

describe("AnalyticsPage", () => {
  it("shows a loading state, then the real metrics from the API", async () => {
    let resolve;
    overview.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(/loading analytics/i);
    resolve(data());
    const key = await screen.findByRole("region", { name: "Key numbers" });
    expect(within(key).getByText("Total applications").parentElement).toHaveTextContent("8");
    expect(within(key).getByText("Interviews").parentElement).toHaveTextContent("2");
    expect(within(key).getByText("Offers").parentElement).toHaveTextContent("1");
    expect(within(key).getByText("Overdue deadlines").parentElement).toHaveTextContent("1");
    expect(lastParams()).toMatchObject({ groupBy: "month", today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it("shows rates with their numerator/denominator and the withdrawn exclusion", async () => {
    overview.mockResolvedValue(data());
    renderPage();
    const rates = await screen.findByRole("region", { name: "Rates" });
    expect(within(rates).getByText("57.1%")).toBeInTheDocument();
    expect(within(rates).getByText("42.9%")).toBeInTheDocument();
    expect(within(rates).getByText("14.3%")).toBeInTheDocument();
    expect(within(rates).getAllByText(/of 7 applications/)).toHaveLength(3);
    expect(screen.getByText(/1 withdrawn application excluded/)).toBeInTheDocument();
  });

  it("shows 'not enough data' instead of 0% when the denominator is zero", async () => {
    overview.mockResolvedValue(
      data({
        totals: { total: 2, byStatus: { ...zero, Withdrawn: 2 }, interviewCount: 0, offerCount: 0 },
        rates: { denominator: 0, excludedWithdrawn: 2, responseRate: none, interviewRate: none, offerRate: none },
      }),
    );
    renderPage();
    const rates = await screen.findByRole("region", { name: "Rates" });
    expect(within(rates).getAllByText("—")).toHaveLength(3);
    expect(within(rates).getAllByText(/Not enough data yet/)).toHaveLength(3);
    expect(within(rates).queryByText("0%")).not.toBeInTheDocument();
  });

  it("renders both charts with accessible alternatives and the metric definitions", async () => {
    overview.mockResolvedValue(data());
    renderPage();
    expect(await screen.findByRole("figure", { name: "Applications by status" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Applications over time" })).toBeInTheDocument();
    expect(screen.getByText("How these numbers are calculated")).toBeInTheDocument();
    expect(screen.getByText(/current status, not history/i)).toBeInTheDocument();
  });

  it("shows an empty state for an account without applications", async () => {
    overview.mockResolvedValue(emptyData());
    renderPage();
    expect(await screen.findByText("No data to analyse yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to applications" })).toHaveAttribute("href", "/applications");
  });

  it("distinguishes 'no data in this range' and can clear the dates", async () => {
    overview.mockResolvedValueOnce(data()).mockResolvedValue(emptyData());
    renderPage();
    await screen.findByRole("region", { name: "Key numbers" });
    fireEvent.change(screen.getByLabelText("Applied from"), { target: { value: "2030-01-01" } });
    expect(await screen.findByText("No applications in this date range")).toBeInTheDocument();
    fireEvent.click(within(screen.getByText("No applications in this date range").parentElement).getByRole("button", { name: "Clear dates" }));
    await waitFor(() => expect(lastParams().from).toBe(""));
  });

  it("shows an error with a retry", async () => {
    overview.mockRejectedValueOnce(new ApiError("Database unavailable", { status: 500 })).mockResolvedValue(data());
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Key numbers" })).toBeInTheDocument();
  });

  it("re-queries when the grouping changes", async () => {
    overview.mockResolvedValue(data());
    renderPage();
    await screen.findByRole("region", { name: "Key numbers" });
    fireEvent.change(screen.getByLabelText("Group over time by"), { target: { value: "week" } });
    await waitFor(() => expect(lastParams().groupBy).toBe("week"));
  });

  it("does not query with a reversed date range and explains why", async () => {
    overview.mockResolvedValue(data());
    renderPage();
    await screen.findByRole("region", { name: "Key numbers" });
    fireEvent.change(screen.getByLabelText("Applied from"), { target: { value: "2026-05-01" } });
    await waitFor(() => expect(lastParams().from).toBe("2026-05-01"));
    const calls = overview.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Applied to"), { target: { value: "2026-01-01" } });
    expect((await screen.findAllByText("End date must not be before the start date")).length).toBeGreaterThan(0);
    expect(overview).toHaveBeenCalledTimes(calls);
  });
});
