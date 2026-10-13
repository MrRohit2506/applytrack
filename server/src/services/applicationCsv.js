// CSV import/export for applications. Import reuses the Phase 2 create schema, so every field is
// validated by exactly the same rules as POST /api/applications.
import { APPLICATION_STATUSES } from "../constants/applicationStatus.js";
import { Application } from "../models/Application.js";
import { createApplicationSchema } from "../validation/application.schemas.js";
import { AppError } from "../utils/AppError.js";
import { CsvParseError, mapHeaders, parseCsv, toCsvLine, unescapeFormula } from "../utils/csv.js";
import { formatCalendarDate } from "../utils/dates.js";

// ---- export ---------------------------------------------------------------------------------
// Stable, documented columns. No ids, ownership or timestamps are ever exported.
export const CSV_COLUMNS = Object.freeze(["company", "role", "applicationDate", "deadline", "status", "jobUrl", "notes"]);
export const REQUIRED_COLUMNS = Object.freeze(["company", "role", "applicationDate"]);

export const csvHeaderLine = () => `${CSV_COLUMNS.join(",")}\r\n`;

export const applicationToCsvLine = (a) =>
  toCsvLine([
    a.company,
    a.role,
    formatCalendarDate(a.applicationDate),
    a.deadline ? formatCalendarDate(a.deadline) : "",
    a.status,
    a.jobUrl ?? "",
    a.notes ?? "",
  ]);

// ---- import ---------------------------------------------------------------------------------
// Accepted header spellings (case-insensitive; spaces, "_" and "-" ignored). Anything else, such as
// userId, _id, id, createdAt, is IGNORED (listed in the report) and never read.
const CANONICAL = {
  company: "company",
  role: "role",
  jobtitle: "role",
  applicationdate: "applicationDate",
  deadline: "deadline",
  status: "status",
  joburl: "jobUrl",
  notes: "notes",
};
const MAX_COLUMNS = 50;
const MAX_REPORTED = 50;
const BATCH_SIZE = 100;
const STATUS_BY_LOWER = new Map(APPLICATION_STATUSES.map((s) => [s.toLowerCase(), s]));

const fileError = (code, message) => new AppError(400, code, message);

/**
 * Parses + validates a CSV string. Throws AppError (400) for file-level problems; row-level problems
 * are returned per row. rows[i] = { row, data } for valid rows or { row, errors } for invalid ones.
 * `row` is the record number counting the header as row 1.
 */
export function analyseImport(text, { maxRows }) {
  if (text.includes("\u0000")) throw fileError("CSV_NOT_TEXT", "This does not look like a text CSV file.");

  let records;
  try {
    records = parseCsv(text, { maxRecords: maxRows + 1 });
  } catch (err) {
    if (err instanceof CsvParseError) {
      if (err.code === "CSV_TOO_MANY_ROWS") {
        throw fileError(err.code, `The file has more than ${maxRows} data rows. Split it into smaller files.`);
      }
      throw fileError(err.code, err.message);
    }
    throw err;
  }

  if (records.length === 0) throw fileError("CSV_EMPTY", "The file is empty.");
  const [header, ...data] = records;
  if (header.length > MAX_COLUMNS) throw fileError("CSV_INVALID_HEADERS", `The file has more than ${MAX_COLUMNS} columns.`);

  const { columns, ignored, duplicates, missing } = mapHeaders(header, CANONICAL, REQUIRED_COLUMNS);
  if (missing.length) {
    throw fileError("CSV_INVALID_HEADERS", `Missing required column(s): ${missing.join(", ")}. Expected headers: ${CSV_COLUMNS.join(", ")}.`);
  }
  if (duplicates.length) {
    throw fileError("CSV_INVALID_HEADERS", `Column(s) appear more than once: ${[...new Set(duplicates)].join(", ")}.`);
  }
  if (data.length === 0) throw fileError("CSV_EMPTY", "The file has a header row but no data rows.");

  const rows = data.map((record, i) => {
    const row = i + 2;
    if (record.length !== header.length) {
      return { row, errors: { _row: `Expected ${header.length} columns but found ${record.length}.` } };
    }
    const candidate = {};
    for (const { index, key } of columns) {
      let value = unescapeFormula(record[index]).trim();
      if (value === "") continue; // empty cell = no value (required fields then fail validation)
      if (key === "status") value = STATUS_BY_LOWER.get(value.toLowerCase()) ?? value;
      candidate[key] = value;
    }
    const parsed = createApplicationSchema.safeParse(candidate);
    if (parsed.success) return { row, data: parsed.data };
    const errors = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "_row")] ??= issue.message;
    return { row, errors };
  });

  return { rows, ignoredColumns: ignored };
}

const dupKey = (company, role, date) => `${company.toLowerCase()}|${role.toLowerCase()}|${date.getTime()}`;

/**
 * Duplicate definition: same owner + same company + same role (case-insensitive, whitespace-normalised)
 * + same application date. Applying to the same company on different dates, or for different roles,
 * is never a duplicate. Duplicates are detected against existing records AND earlier rows of the file.
 * policy "skip" leaves them out; "import" imports them anyway. Nothing is ever overwritten.
 */
export async function planImport(userId, analysis, policy) {
  const valid = analysis.rows.filter((r) => r.data);
  const dates = [...new Set(valid.map((r) => r.data.applicationDate.getTime()))].map((t) => new Date(t));

  const existing = dates.length
    ? await Application.find({ userId, applicationDate: { $in: dates } }).select("company role applicationDate").lean()
    : [];
  const known = new Set(existing.map((e) => dupKey(e.company, e.role, e.applicationDate)));
  const seen = new Set();

  const toInsert = [];
  const duplicates = [];
  for (const r of valid) {
    const key = dupKey(r.data.company, r.data.role, r.data.applicationDate);
    const reason = known.has(key) ? "existing" : seen.has(key) ? "in-file" : null;
    seen.add(key);
    if (reason) {
      duplicates.push({ row: r.row, company: r.data.company, role: r.data.role, applicationDate: formatCalendarDate(r.data.applicationDate), reason });
      if (policy === "skip") continue;
    }
    toInsert.push(r);
  }
  return { valid, toInsert, duplicates };
}

/**
 * Inserts in bounded batches (unordered). The owner is ALWAYS the session user; no CSV value can
 * influence userId, _id or timestamps. No transaction is used: rows are independent and already
 * validated, so each batch's actual outcome is reported instead. After a database error the remaining
 * batches are not attempted.
 */
export async function commitImport(userId, toInsert) {
  let imported = 0;
  const dbErrors = [];
  let attempted = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    attempted += batch.length;
    const docs = batch.map(({ data: d }) => ({
      userId,
      company: d.company,
      role: d.role,
      applicationDate: d.applicationDate,
      deadline: d.deadline ?? null,
      status: d.status ?? "Applied",
      jobUrl: d.jobUrl ?? "",
      notes: d.notes ?? "",
    }));
    const range = { fromRow: batch[0].row, toRow: batch[batch.length - 1].row };
    try {
      const inserted = await Application.insertMany(docs, { ordered: false });
      imported += inserted.length;
      if (inserted.length < docs.length) {
        dbErrors.push({ ...range, notSaved: docs.length - inserted.length, message: "Some rows in this batch were not saved." });
      }
    } catch (err) {
      const saved = err?.insertedDocs?.length ?? 0;
      imported += saved;
      dbErrors.push({ ...range, notSaved: docs.length - saved, message: "A database error prevented some rows in this batch from being saved." });
      break;
    }
  }
  return { imported, dbErrors, notAttempted: toInsert.length - attempted };
}

export function buildImportReport(analysis, plan, { commit, policy, result }) {
  const invalid = analysis.rows.filter((r) => r.errors);
  const report = {
    committed: commit,
    duplicatePolicy: policy,
    totalRows: analysis.rows.length,
    validRows: plan.valid.length,
    invalidRows: invalid.length,
    duplicateRows: plan.duplicates.length,
    importable: plan.toInsert.length,
    ignoredColumns: analysis.ignoredColumns,
    errors: invalid.slice(0, MAX_REPORTED).map((r) => ({ row: r.row, errors: r.errors })),
    errorsTruncated: invalid.length > MAX_REPORTED,
    duplicates: plan.duplicates.slice(0, MAX_REPORTED),
    duplicatesTruncated: plan.duplicates.length > MAX_REPORTED,
    preview: plan.toInsert.slice(0, 5).map(({ row, data: d }) => ({
      row,
      company: d.company,
      role: d.role,
      applicationDate: formatCalendarDate(d.applicationDate),
      deadline: d.deadline ? formatCalendarDate(d.deadline) : null,
      status: d.status ?? "Applied",
    })),
  };
  if (commit) {
    const { imported, dbErrors, notAttempted } = result;
    Object.assign(report, {
      imported,
      skippedDuplicates: policy === "skip" ? plan.duplicates.length : 0,
      rejected: invalid.length,
      failedWrites: plan.toInsert.length - imported,
      notAttempted,
      dbErrors,
      outcome: plan.toInsert.length === 0 ? "nothing-to-import" : dbErrors.length === 0 ? "completed" : imported > 0 ? "partial" : "failed",
    });
  }
  return report;
}
