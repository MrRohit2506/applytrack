import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.jsx";
import DashboardPage from "../pages/DashboardPage.jsx";

vi.mock("../lib/apiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, api: { ...actual.api, analytics: { overview: vi.fn() }, reminders: { list: vi.fn() } } };
});
import { ApiError, api } from "../lib/apiClient.js";

const { overview } = api.analytics;
const { list } = api.reminders;

const stats = (total = 8) => ({
  totals: { total, byStatus: {}, interviewCount: total ? 2 : 0, offerCount: total ? 1 : 0 },
});
const rem = (reminders, counts) => ({
  today: "2026-03-10",
  windowDays: 7,
  counts: { overdue: 0, dueToday: 0, upcoming: 0, total: reminders.length, ...counts },
  reminders,
  truncated: false,
});
const item = (o) => ({ id: "1", company: "Acme", role: "Dev", status: "Applied", applicationDate: "2026-01-01", deadline: "2026-03-12", category: "upcoming", daysUntil: 2, ...o });

const renderPage = () =>
  render(
    <AuthContext.Provider value={{ user: { name: "Ada" }, status: "authenticated" }}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

beforeEach(() => vi.resetAllMocks());

describe("DashboardPage", () => {
  it("shows real summary numbers and distinguishes overdue, due-today and upcoming reminders", async () => {
    overview.mockResolvedValue(stats());
    list.mockResolvedValue(
      rem(
        [
          item({ id: "a", company: "Globex", category: "overdue", daysUntil: -2, deadline: "2026-03-08" }),
          item({ id: "b", company: "Wayne", category: "dueToday", daysUntil: 0, deadline: "2026-03-10" }),
          item({ id: "c", company: "Acme", category: "upcoming", daysUntil: 2 }),
        ],
        { overdue: 1, dueToday: 1, upcoming: 1 },
      ),
    );
    renderPage();
    expect(screen.getByRole("heading", { name: "Welcome, Ada" })).toBeInTheDocument();
    const panel = await screen.findByRole("region", { name: "Deadline reminders" });
    await within(panel).findByText("Globex");
    expect(within(panel).getByText("Overdue by 2 days")).toBeInTheDocument();
    expect(within(panel).getByText("Due today")).toBeInTheDocument();
    expect(within(panel).getByText("Due in 2 days")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("Needs attention").parentElement).toHaveTextContent("2"); // overdue + due today
    expect(within(summary).getByText("Applications").parentElement).toHaveTextContent("8");
  });

  it("links each reminder to its application", async () => {
    overview.mockResolvedValue(stats());
    list.mockResolvedValue(rem([item({ id: "abc123", company: "Acme", role: "Dev" })], { upcoming: 1 }));
    renderPage();
    const link = await screen.findByRole("link", { name: "Open Acme – Dev" });
    expect(link).toHaveAttribute("href", "/applications?edit=abc123");
  });

  it("shows a calm empty state when nothing needs attention", async () => {
    overview.mockResolvedValue(stats());
    list.mockResolvedValue(rem([], {}));
    renderPage();
    expect(await screen.findByText(/Nothing needs attention/)).toBeInTheDocument();
  });

  it("prompts a brand-new account to add or import applications", async () => {
    overview.mockResolvedValue(stats(0));
    list.mockResolvedValue(rem([], {}));
    renderPage();
    expect(await screen.findByText("Add your first application")).toBeInTheDocument();
  });

  it("shows a retryable error if reminders cannot be loaded", async () => {
    overview.mockResolvedValue(stats());
    list.mockRejectedValueOnce(new ApiError("Reminders unavailable", { status: 500 })).mockResolvedValue(rem([], {}));
    renderPage();
    expect(await screen.findByText("Reminders unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Nothing needs attention/)).toBeInTheDocument();
  });

  it("shows a retryable error if the summary cannot be loaded", async () => {
    overview.mockRejectedValueOnce(new ApiError("Stats down", { status: 500 })).mockResolvedValue(stats());
    list.mockResolvedValue(rem([], {}));
    renderPage();
    expect(await screen.findByText(/Stats down/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);
    expect(await screen.findByRole("region", { name: "Summary" })).toBeInTheDocument();
  });
});
