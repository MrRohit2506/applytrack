import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImportCsvModal from "../components/ImportCsvModal.jsx";

vi.mock("../lib/apiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, api: { ...actual.api, applications: { importCsv: vi.fn() } } };
});
vi.mock("../lib/download.js", async (importOriginal) => ({ ...(await importOriginal()), saveBlob: vi.fn() }));
import { ApiError, api } from "../lib/apiClient.js";
import { saveBlob } from "../lib/download.js";

const { importCsv } = api.applications;
const CSV = "company,role,applicationDate\nAcme,Dev,2026-03-05\n";

const report = (o = {}) => ({
  committed: false,
  duplicatePolicy: "skip",
  totalRows: 4,
  validRows: 3,
  invalidRows: 1,
  duplicateRows: 1,
  importable: 2,
  ignoredColumns: ["userId"],
  errors: [{ row: 3, errors: { applicationDate: "Application date must be a valid date (YYYY-MM-DD)" } }],
  errorsTruncated: false,
  duplicates: [{ row: 4, company: "Acme", role: "Dev", applicationDate: "2026-03-05", reason: "existing" }],
  duplicatesTruncated: false,
  preview: [{ row: 2, company: "Globex", role: "Dev", applicationDate: "2026-03-06", deadline: null, status: "Applied" }],
  ...o,
});
const done = (o = {}) => report({ committed: true, imported: 2, skippedDuplicates: 1, rejected: 1, failedWrites: 0, notAttempted: 0, dbErrors: [], outcome: "completed", ...o });

function setup() {
  const onClose = vi.fn();
  const onImported = vi.fn();
  render(<ImportCsvModal onClose={onClose} onImported={onImported} />);
  return { onClose, onImported };
}
async function pick(text = CSV, name = "jobs.csv") {
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [new File([text], name, { type: "text/csv" })] } });
}

beforeEach(() => vi.resetAllMocks());

describe("ImportCsvModal", () => {
  it("explains the expected format and offers a template", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: /import applications from csv/i });
    expect(dialog).toHaveTextContent("company");
    expect(dialog).toHaveTextContent("applicationDate");
    expect(dialog).toHaveTextContent("YYYY-MM-DD");
    fireEvent.click(screen.getByRole("button", { name: "Download a template" }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
  });

  it("validates on the server first (preview) and writes nothing", async () => {
    importCsv.mockResolvedValue(report());
    setup();
    await pick();
    expect(await screen.findByText(/Nothing has been imported yet/)).toBeInTheDocument();
    expect(importCsv).toHaveBeenCalledWith(CSV, { commit: false, duplicates: "skip" });
    expect(screen.getByText("Rows in file").parentElement).toHaveTextContent("4");
    expect(screen.getByText("With problems").parentElement).toHaveTextContent("1");
    expect(screen.getByText(/Row 3:/).parentElement).toHaveTextContent("Application date must be a valid date");
    expect(screen.getByText(/Ignored columns: userId/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 2 applications" })).toBeEnabled();
  });

  it("imports after confirmation and reports imported, skipped and rejected rows", async () => {
    importCsv.mockResolvedValueOnce(report()).mockResolvedValueOnce(done());
    const { onImported, onClose } = setup();
    await pick();
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 applications" }));
    expect(await screen.findByText("Imported 2 applications")).toBeInTheDocument();
    expect(importCsv).toHaveBeenLastCalledWith(CSV, { commit: true, duplicates: "skip" });
    expect(screen.getByText("Skipped duplicates").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Rejected rows").parentElement).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ imported: 2 }));
    expect(onClose).toHaveBeenCalled();
  });

  it("lets the user choose to import possible duplicates and updates the count", async () => {
    importCsv.mockResolvedValueOnce(report()).mockResolvedValueOnce(done({ imported: 3, skippedDuplicates: 0 }));
    setup();
    await pick();
    await screen.findByRole("button", { name: "Import 2 applications" });
    fireEvent.click(screen.getByLabelText(/Import them anyway/));
    fireEvent.click(screen.getByRole("button", { name: "Import 3 applications" }));
    await screen.findByText("Imported 3 applications");
    expect(importCsv).toHaveBeenLastCalledWith(CSV, { commit: true, duplicates: "import" });
  });

  it("shows file-level problems from the server and stays on the file step", async () => {
    importCsv.mockRejectedValue(new ApiError("Missing required column(s): role.", { status: 400, code: "CSV_INVALID_HEADERS" }));
    setup();
    await pick("company\nAcme\n");
    expect(await screen.findByRole("alert")).toHaveTextContent("Missing required column(s): role.");
    expect(screen.getByLabelText("CSV file")).toBeEnabled();
  });

  it("disables the import button when no row can be imported", async () => {
    importCsv.mockResolvedValue(report({ validRows: 0, invalidRows: 4, duplicateRows: 0, duplicates: [], importable: 0 }));
    setup();
    await pick();
    expect(await screen.findByRole("button", { name: "Nothing to import" })).toBeDisabled();
  });

  it("reports a partial database failure honestly", async () => {
    importCsv.mockResolvedValueOnce(report()).mockResolvedValueOnce(
      done({ imported: 1, failedWrites: 1, notAttempted: 0, outcome: "partial", dbErrors: [{ fromRow: 2, toRow: 3, notSaved: 1, message: "x" }] }),
    );
    const { onImported } = setup();
    await pick();
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 applications" }));
    expect(await screen.findByText(/Partly imported: 1 saved, 1 not saved/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/rows 2–3/);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onImported).toHaveBeenCalled(); // something was saved, so the list must refresh
  });

  it("does not claim success when nothing was saved", async () => {
    importCsv.mockResolvedValueOnce(report()).mockResolvedValueOnce(
      done({ imported: 0, failedWrites: 2, outcome: "failed", dbErrors: [{ fromRow: 2, toRow: 5, notSaved: 2, message: "x" }] }),
    );
    const { onImported } = setup();
    await pick();
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 applications" }));
    expect(await screen.findByText("Import failed: nothing was saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onImported).not.toHaveBeenCalled();
  });

  it("shows an error if confirming fails and keeps the preview", async () => {
    importCsv.mockResolvedValueOnce(report()).mockRejectedValueOnce(new ApiError("Unable to reach the server.", { code: "NETWORK_ERROR" }));
    setup();
    await pick();
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 applications" }));
    expect(await screen.findByText(/Unable to reach the server/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 2 applications" })).toBeEnabled());
  });
});
