// Dependency-free CSV helpers (RFC 4180 with a few lenient behaviours, documented in the README).

export class CsvParseError extends Error {
  constructor(message, code = "CSV_MALFORMED") {
    super(message);
    this.name = "CsvParseError";
    this.code = code;
  }
}

/**
 * Parses CSV text into records (arrays of strings).
 *  - Handles quoted fields, "" escapes, commas and line breaks inside quotes, CRLF/LF/CR, a UTF-8 BOM.
 *  - Blank lines are skipped. A quote inside an unquoted field is kept literally (lenient).
 *  - Throws CsvParseError for an unterminated quoted field, or when more than `maxRecords` records exist.
 */
export function parseCsv(input, { maxRecords = Infinity } = {}) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const endRecord = () => {
    row.push(field);
    field = "";
    if (!(row.length === 1 && row[0] === "")) {
      records.push(row);
      if (records.length > maxRecords) throw new CsvParseError("Too many rows.", "CSV_TOO_MANY_ROWS");
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRecord();
    } else if (c === "\n") {
      endRecord();
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new CsvParseError("A quoted field is never closed (missing closing quote).");
  if (field !== "" || row.length > 0) endRecord();
  return records;
}

/**
 * Spreadsheet formula-injection defence: cells that a spreadsheet would evaluate as a formula
 * (starting with = + - @, optionally after whitespace, or with a tab/CR) get a leading apostrophe.
 */
export function neutralizeFormula(value) {
  return /^[\t\r]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Inverse of neutralizeFormula for round-tripping our own exports on import. */
export function unescapeFormula(value) {
  return /^'(?=[\t\r]|\s*[=+\-@])/.test(value) ? value.slice(1) : value;
}

export function escapeCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  s = neutralizeFormula(s);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV record terminated with CRLF. */
export const toCsvLine = (values) => `${values.map(escapeCell).join(",")}\r\n`;

/**
 * Maps a header row onto canonical column keys.
 * `canonical` maps normalised header text (lowercase, no spaces/_/-) to a key. Unknown columns are
 * reported in `ignored` and never read.
 */
export function mapHeaders(headerRow, canonical, required = []) {
  const normalise = (h) => h.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const columns = [];
  const ignored = [];
  const seen = new Set();
  const duplicates = [];
  headerRow.forEach((h, index) => {
    const key = canonical[normalise(h)];
    if (!key) return ignored.push(h.trim() || `(column ${index + 1})`);
    if (seen.has(key)) return duplicates.push(key);
    seen.add(key);
    columns.push({ index, key });
  });
  return { columns, ignored, duplicates, missing: required.filter((k) => !seen.has(k)) };
}
