import { describe, expect, it } from "vitest";
import { CsvParseError, escapeCell, mapHeaders, neutralizeFormula, parseCsv, toCsvLine, unescapeFormula } from "../src/utils/csv.js";

describe("parseCsv", () => {
  it("parses simple records with LF, CRLF and CR line endings and ignores a trailing newline", () => {
    const expected = [["a", "b"], ["1", "2"]];
    expect(parseCsv("a,b\n1,2\n")).toEqual(expected);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual(expected);
    expect(parseCsv("a,b\r1,2")).toEqual(expected);
  });

  it("handles quoted commas, escaped quotes and embedded line breaks", () => {
    const text = 'company,notes\r\n"Acme, Inc.","He said ""hi""\nsecond line"\r\n';
    expect(parseCsv(text)).toEqual([["company", "notes"], ["Acme, Inc.", 'He said "hi"\nsecond line']]);
  });

  it("keeps empty cells and strips a UTF-8 BOM", () => {
    expect(parseCsv("\uFEFFa,b,c\n1,,3\n,,\n")).toEqual([["a", "b", "c"], ["1", "", "3"], ["", "", ""]]);
    expect(parseCsv('a,b\n"",x\n')).toEqual([["a", "b"], ["", "x"]]);
  });

  it("preserves Unicode", () => {
    expect(parseCsv("company\nÅngström 日本語 🚀\n")).toEqual([["company"], ["Ångström 日本語 🚀"]]);
  });

  it("skips blank lines and returns [] for empty input", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("keeps a stray quote inside an unquoted field literally", () => {
    expect(parseCsv('5" pipe,x\n')).toEqual([['5" pipe', "x"]]);
  });

  it("rejects an unterminated quoted field", () => {
    expect(() => parseCsv('a,b\n"oops,1\n')).toThrow(CsvParseError);
  });

  it("stops when there are more records than allowed", () => {
    expect(parseCsv("h\n1\n2\n", { maxRecords: 3 })).toEqual([["h"], ["1"], ["2"]]);
    expect(() => parseCsv("h\n1\n2\n3\n", { maxRecords: 3 })).toThrow(CsvParseError);
  });
});

describe("formula-injection defence and cell escaping", () => {
  it("prefixes cells a spreadsheet would execute", () => {
    for (const v of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=1", "\r=1", "  =HYPERLINK(\"x\")"]) {
      expect(neutralizeFormula(v).startsWith("'")).toBe(true);
    }
    for (const v of ["Acme", "a=b", "x-y", "", "'quoted"]) expect(neutralizeFormula(v)).toBe(v);
  });

  it("round-trips through unescapeFormula", () => {
    for (const v of ["=1+1", "@x", "-5", "+1"]) expect(unescapeFormula(neutralizeFormula(v))).toBe(v);
    expect(unescapeFormula("'normal")).toBe("'normal");
  });

  it("quotes cells containing commas, quotes or line breaks", () => {
    expect(escapeCell("plain")).toBe("plain");
    expect(escapeCell("a,b")).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell("l1\nl2")).toBe('"l1\nl2"');
    expect(escapeCell(null)).toBe("");
    expect(escapeCell("=2+2")).toBe("'=2+2");
  });

  it("export lines parse back to the same values (including hostile content)", () => {
    const values = ['Acme, "Inc."', "=cmd|' /C calc'!A0", "Zürich 🚀", "line1\r\nline2", "", "-x"];
    const parsed = parseCsv(toCsvLine(values));
    expect(parsed.length).toBe(1);
    expect(parsed[0].map(unescapeFormula)).toEqual(values);
  });
});

describe("mapHeaders", () => {
  const canonical = { company: "company", role: "role", jobtitle: "role", applicationdate: "applicationDate", notes: "notes" };
  const required = ["company", "role", "applicationDate"];

  it("matches headers case-insensitively and ignores spaces/underscores/dashes", () => {
    const m = mapHeaders(["Company", "Job Title", "application_date", "NOTES"], canonical, required);
    expect(m.columns).toEqual([
      { index: 0, key: "company" },
      { index: 1, key: "role" },
      { index: 2, key: "applicationDate" },
      { index: 3, key: "notes" },
    ]);
    expect(m.missing).toEqual([]);
  });

  it("reports unknown/protected columns as ignored, never mapped", () => {
    const m = mapHeaders(["company", "role", "applicationDate", "userId", "_id", "createdAt", ""], canonical, required);
    expect(m.ignored).toEqual(["userId", "_id", "createdAt", "(column 7)"]);
    expect(m.columns.map((c) => c.key)).toEqual(["company", "role", "applicationDate"]);
  });

  it("reports missing required and duplicated columns", () => {
    expect(mapHeaders(["company", "notes"], canonical, required).missing).toEqual(["role", "applicationDate"]);
    expect(mapHeaders(["company", "role", "jobTitle", "applicationDate"], canonical, required).duplicates).toEqual(["role"]);
  });
});
