import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../context/ToastContext.jsx";
import { formatCalendarDate } from "../lib/dates.js";
import ApplicationsPage from "../pages/ApplicationsPage.jsx";

vi.mock("../lib/apiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      applications: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), exportCsv: vi.fn(), importCsv: vi.fn() },
    },
  };
});
vi.mock("../lib/download.js", async (importOriginal) => ({ ...(await importOriginal()), saveBlob: vi.fn() }));
import { ApiError, api } from "../lib/apiClient.js";
import { saveBlob } from "../lib/download.js";

const { list, create, update, remove, get, exportCsv } = api.applications;

const mk = (o = {}) => ({
  id: "1",
  company: "Acme Corp",
  role: "Frontend Engineer",
  applicationDate: "2026-03-05",
  deadline: null,
  status: "Applied",
  jobUrl: "",
  notes: "",
  createdAt: "2026-03-05T00:00:00.000Z",
  updatedAt: "2026-03-05T00:00:00.000Z",
  ...o,
});
const pageOf = (apps, p = {}) => ({
  applications: apps,
  pagination: { page: 1, limit: 10, total: apps.length, totalPages: apps.length ? 1 : 0, ...p },
});
const lastCall = () => list.mock.calls[list.mock.calls.length - 1][0];

function renderPage(entry = "/applications") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <ApplicationsPage searchDebounceMs={50} />
      </ToastProvider>
    </MemoryRouter>,
  );
}
const searchBox = () => screen.getByLabelText(/search company or job title/i);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loading, empty and error states", () => {
  it("shows a loading state first, with the page controls available", () => {
    list.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(/loading applications/i);
    expect(screen.getByRole("button", { name: "Add application" })).toBeInTheDocument();
  });

  it("renders records from the API with a total count", async () => {
    list.mockResolvedValue(pageOf([mk(), mk({ id: "2", company: "Globex", role: "Backend Engineer", status: "Interview", deadline: "2026-04-01" })]));
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Acme Corp")).toBeInTheDocument();
    expect(within(table).getByText("Interview")).toBeInTheDocument();
    expect(within(table).getByText(formatCalendarDate("2026-04-01"))).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–2 of 2 applications/)).toBeInTheDocument();
  });

  it("shows the first-application empty state with a working call to action", async () => {
    list.mockResolvedValue(pageOf([]));
    renderPage();
    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add your first application" }));
    expect(screen.getByRole("dialog", { name: /add application/i })).toBeInTheDocument();
  });

  it("distinguishes 'no results for these filters' and can clear them", async () => {
    list.mockResolvedValueOnce(pageOf([mk()])).mockResolvedValue(pageOf([]));
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(searchBox(), { target: { value: "zzz" } });
    const heading = await screen.findByText("No matching applications");
    fireEvent.click(within(heading.parentElement).getByRole("button", { name: /clear filters/i }));
    await waitFor(() => expect(lastCall().search).toBe(""));
    expect(searchBox()).toHaveValue("");
  });

  it("shows a failed request with a retry that recovers", async () => {
    list.mockRejectedValueOnce(new ApiError("Server exploded", { status: 500 })).mockResolvedValue(pageOf([mk()]));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Server exploded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});

describe("search, filters, sorting and pagination", () => {
  it("debounces search and resets to page 1", async () => {
    list.mockResolvedValue(pageOf([mk()], { total: 25, totalPages: 3 }));
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastCall().page).toBe(2));
    const before = list.mock.calls.length;
    fireEvent.change(searchBox(), { target: { value: "acme" } });
    expect(list).toHaveBeenCalledTimes(before); // not yet: debounced
    await waitFor(() => expect(list).toHaveBeenCalledTimes(before + 1));
    expect(lastCall()).toMatchObject({ search: "acme", page: 1 });
  });

  it("toggles status filters and sends them to the server", async () => {
    list.mockResolvedValue(pageOf([mk()]));
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Offer" }));
    await waitFor(() => expect(lastCall().status).toEqual(["Offer"]));
    expect(screen.getByRole("button", { name: "Offer" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Applied" }));
    await waitFor(() => expect(lastCall().status).toEqual(["Offer", "Applied"]));
  });

  it("sends sort choices (with the field's default order) to the server", async () => {
    list.mockResolvedValue(pageOf([mk()]));
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "company" } });
    await waitFor(() => expect(lastCall()).toMatchObject({ sortBy: "company", sortOrder: "asc", page: 1 }));
    fireEvent.change(screen.getByLabelText("Order"), { target: { value: "desc" } });
    await waitFor(() => expect(lastCall()).toMatchObject({ sortBy: "company", sortOrder: "desc" }));
  });

  it("does not send an invalid date range and explains the problem", async () => {
    list.mockResolvedValue(pageOf([mk()]));
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Applied from"), { target: { value: "2026-05-01" } });
    await waitFor(() => expect(lastCall().applicationDateFrom).toBe("2026-05-01"));
    const calls = list.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Applied to"), { target: { value: "2026-01-01" } });
    expect(await screen.findByText("End date must not be before the start date")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(calls);
  });

  it("paginates: Previous is disabled on page 1, Next requests page 2", async () => {
    list.mockResolvedValue(pageOf([mk()], { total: 25, totalPages: 3 }));
    renderPage();
    await screen.findByRole("table");
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastCall().page).toBe(2));
  });

  it("changing the page size resets to page 1", async () => {
    list.mockResolvedValue(pageOf([mk()], { total: 60, totalPages: 6 }));
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "25" } });
    await waitFor(() => expect(lastCall()).toMatchObject({ limit: 25, page: 1 }));
  });

  it("moves to the last valid page when the current page has disappeared", async () => {
    list
      .mockResolvedValueOnce(pageOf([mk()], { page: 1, total: 11, totalPages: 2 }))
      .mockResolvedValueOnce({ applications: [], pagination: { page: 2, limit: 10, total: 10, totalPages: 1 } })
      .mockResolvedValue(pageOf([mk()], { page: 1, total: 10, totalPages: 1 }));
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(lastCall().page).toBe(1);
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("ignores a slow, superseded response", async () => {
    let resolveFirst;
    list
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockResolvedValue(pageOf([mk({ id: "2", company: "Newer Co" })]));
    renderPage();
    fireEvent.change(searchBox(), { target: { value: "x" } });
    expect(await screen.findByText("Newer Co", { selector: "td" })).toBeInTheDocument();
    await act(async () => {
      resolveFirst(pageOf([mk({ company: "Older Co" })]));
    });
    expect(screen.queryByText("Older Co")).not.toBeInTheDocument();
    expect(screen.getByText("Newer Co", { selector: "td" })).toBeInTheDocument();
  });
});

describe("create and edit", () => {
  beforeEach(() => {
    list.mockResolvedValue(pageOf([mk()]));
  });

  async function openCreate() {
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Add application" }));
    return screen.getByRole("dialog", { name: /add application/i });
  }

  it("shows field-level validation and does not call the API", async () => {
    renderPage();
    const dialog = await openCreate();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add application" }));
    expect(within(dialog).getByText("Company is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Job title is required")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Company")).toHaveAttribute("aria-invalid", "true");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates an application once, disables the form while saving, then closes, notifies and refreshes", async () => {
    let resolveCreate;
    create.mockReturnValue(new Promise((r) => (resolveCreate = r)));
    renderPage();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("Company"), { target: { value: "  Initech  " } });
    fireEvent.change(within(dialog).getByLabelText("Job title"), { target: { value: "Dev" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add application" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ company: "Initech", role: "Dev", status: "Applied", deadline: null, jobUrl: "", notes: "" }));
    const saving = within(dialog).getByRole("button", { name: /saving/i });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(create).toHaveBeenCalledTimes(1); // no duplicate submission

    const callsBefore = list.mock.calls.length;
    await act(async () => resolveCreate({ application: mk({ id: "9", company: "Initech" }) }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Application added.")).toBeInTheDocument();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("keeps the dialog and the user's input when the server rejects the request", async () => {
    create.mockRejectedValue(new ApiError("Please correct the highlighted fields.", { status: 400, fieldErrors: { role: "Job title must be at most 120 characters" } }));
    renderPage();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("Company"), { target: { value: "Initech" } });
    fireEvent.change(within(dialog).getByLabelText("Job title"), { target: { value: "Dev" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add application" }));

    expect(await within(dialog).findByText("Job title must be at most 120 characters")).toBeInTheDocument();
    expect(within(dialog).getByText("Please correct the highlighted fields.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Company")).toHaveValue("Initech");
    expect(within(dialog).getByRole("button", { name: "Add application" })).toBeEnabled();
  });

  it("shows a network failure inside the form without losing input", async () => {
    create.mockRejectedValue(new ApiError("Unable to reach the server. Check your connection and try again.", { code: "NETWORK_ERROR" }));
    renderPage();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("Company"), { target: { value: "Initech" } });
    fireEvent.change(within(dialog).getByLabelText("Job title"), { target: { value: "Dev" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add application" }));
    expect(await within(dialog).findByText(/unable to reach the server/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Job title")).toHaveValue("Dev");
  });

  it("prefills the edit form and sends only the changed fields", async () => {
    update.mockResolvedValue({ application: mk({ status: "Offer" }) });
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getAllByRole("button", { name: /Edit Acme Corp/ })[0]);
    const dialog = screen.getByRole("dialog", { name: /edit application/i });
    expect(within(dialog).getByLabelText("Company")).toHaveValue("Acme Corp");
    expect(within(dialog).getByLabelText("Job title")).toHaveValue("Frontend Engineer");
    expect(within(dialog).getByLabelText("Application date")).toHaveValue("2026-03-05");
    expect(within(dialog).getByLabelText("Status")).toHaveValue("Applied");

    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Offer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("1", { status: "Offer" }));
    expect(await screen.findByText("Application updated.")).toBeInTheDocument();
  });

  it("can clear an optional field when editing", async () => {
    list.mockResolvedValue(pageOf([mk({ deadline: "2026-04-01" })]));
    update.mockResolvedValue({ application: mk() });
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getAllByRole("button", { name: /Edit Acme Corp/ })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Deadline (optional)"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("1", { deadline: null }));
  });

  it("closes without a request when nothing changed", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getAllByRole("button", { name: /Edit Acme Corp/ })[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(update).not.toHaveBeenCalled();
  });

  it("closes the dialog with Escape", async () => {
    renderPage();
    await openCreate();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("delete", () => {
  beforeEach(() => {
    list.mockResolvedValue(pageOf([mk()]));
  });

  async function openDelete() {
    await screen.findByRole("table");
    fireEvent.click(screen.getAllByRole("button", { name: /Delete Acme Corp/ })[0]);
    return screen.getByRole("dialog", { name: /delete application/i });
  }

  it("identifies the record and cancelling sends nothing", async () => {
    renderPage();
    const dialog = await openDelete();
    expect(dialog).toHaveTextContent("Acme Corp");
    expect(dialog).toHaveTextContent("Frontend Engineer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes after confirmation, shows pending state, notifies and refreshes", async () => {
    let resolveRemove;
    remove.mockReturnValue(new Promise((r) => (resolveRemove = r)));
    renderPage();
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const pending = await within(dialog).findByRole("button", { name: /deleting/i });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("1");

    const before = list.mock.calls.length;
    await act(async () => resolveRemove({ id: "1" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Application deleted.")).toBeInTheDocument();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });

  it("shows an error and keeps the dialog open when deletion fails", async () => {
    remove.mockRejectedValue(new ApiError("Could not delete right now", { status: 500 }));
    renderPage();
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText("Could not delete right now")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});

describe("export, import and reminder deep links", () => {
  beforeEach(() => {
    list.mockResolvedValue(pageOf([mk()]));
  });

  it("exports all applications and downloads the file with a dated name", async () => {
    const blob = new Blob(["company\n"], { type: "text/csv" });
    exportCsv.mockResolvedValue({ blob, count: 3 });
    renderPage();
    await screen.findByRole("table");
    expect(screen.getByText(/regardless of the filters/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(saveBlob.mock.calls[0][0]).toBe(blob);
    expect(saveBlob.mock.calls[0][1]).toMatch(/^applytrack-applications-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(await screen.findByText("Exported 3 applications.")).toBeInTheDocument();
  });

  it("says so when there is nothing to export", async () => {
    exportCsv.mockResolvedValue({ blob: new Blob([""]), count: 0 });
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByText(/headers only/i)).toBeInTheDocument();
  });

  it("shows an error toast and re-enables the button when the export fails", async () => {
    exportCsv.mockRejectedValue(new ApiError("Export blew up", { status: 500 }));
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(await screen.findByText("Export blew up")).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("opens the import dialog", async () => {
    renderPage();
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    expect(screen.getByRole("dialog", { name: /import applications from csv/i })).toBeInTheDocument();
  });

  it("opens the edit form for /applications?edit=<id> (link from a reminder)", async () => {
    get.mockResolvedValue({ application: mk() });
    renderPage("/applications?edit=1");
    const dialog = await screen.findByRole("dialog", { name: /edit application/i });
    expect(get).toHaveBeenCalledWith("1");
    expect(within(dialog).getByLabelText("Company")).toHaveValue("Acme Corp");
  });

  it("explains when the linked application no longer exists", async () => {
    get.mockRejectedValue(new ApiError("Application not found.", { status: 404 }));
    renderPage("/applications?edit=gone");
    expect(await screen.findByText("That application could not be found.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

