import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { Application } from "../src/models/Application.js";
import { parseCsv, unescapeFormula } from "../src/utils/csv.js";
import { anonymous, http, newUser, resetCollections, seed, startTestDb, stopTestDb } from "./helpers.js";

let app;
let alice;
let bob;
let A;
let B;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
});
afterAll(stopTestDb);
beforeEach(async () => {
  await resetCollections();
  alice = await newUser(app, "alice@example.com");
  bob = await newUser(app, "bob@example.com");
  A = http(alice);
  B = http(bob);
});
afterEach(() => vi.restoreAllMocks());

const HEADER = "company,role,applicationDate,deadline,status,jobUrl,notes";
const stripBom = (s) => s.replace(/^\uFEFF/, "");
const exportCsv = (u) => u.get("/api/applications/export").buffer(true).parse((res, cb) => {
  res.setEncoding("utf8");
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => cb(null, data));
});
const postCsv = (u, csv, qs = "") =>
  u.agent.post(`/api/applications/import${qs}`).set("X-CSRF-Token", u.token).set("Content-Type", "text/csv").send(csv);
const countFor = (u) => Application.countDocuments({ userId: u.id });

// ===================================================================== export
describe("GET /api/applications/export", () => {
  it("requires authentication", async () => {
    await http(await anonymous(app)).get("/api/applications/export").expect(401);
  });

  it("returns a CSV attachment with a stable header, BOM, record count and dated filename", async () => {
    await seed(alice.id, [{ company: "Acme", role: "Dev", applicationDate: "2026-03-05", deadline: "2026-04-01", status: "Interview", jobUrl: "https://e.com/1", notes: "hi" }]);
    const res = await exportCsv(A).expect(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="applytrack-applications-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers["x-record-count"]).toBe("1");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(res.body)).toEqual([HEADER.split(","), ["Acme", "Dev", "2026-03-05", "2026-04-01", "Interview", "https://e.com/1", "hi"]]);
  });

  it("exports only the signed-in user's records and no internal fields", async () => {
    await seed(alice.id, [{ company: "AliceCo", role: "Dev", applicationDate: "2026-01-01" }]);
    await seed(bob.id, [{ company: "BobCo", role: "Dev", applicationDate: "2026-01-02", notes: "bob private" }]);
    const text = (await exportCsv(A).expect(200)).body;
    expect(text).toContain("AliceCo");
    expect(text).not.toMatch(/BobCo|bob private/);
    expect(text).not.toMatch(/userId|_id|createdAt|updatedAt|passwordHash|\b[0-9a-f]{24}\b/i);
  });

  it("exports a header-only file for an empty account", async () => {
    const res = await exportCsv(B).expect(200);
    expect(res.headers["x-record-count"]).toBe("0");
    expect(stripBom(res.body)).toBe(`${HEADER}\r\n`);
  });

  it("preserves commas, quotes, line breaks and Unicode", async () => {
    const original = [
      { company: 'Acme, "Inc."', role: "Zürich 日本語 🚀", applicationDate: "2026-03-05", notes: "line1\r\nline2,\n\"quoted\"" },
    ];
    await seed(alice.id, original);
    const [, row] = parseCsv((await exportCsv(A).expect(200)).body);
    expect(row[0]).toBe('Acme, "Inc."');
    expect(row[1]).toBe("Zürich 日本語 🚀");
    expect(row[6]).toBe("line1\r\nline2,\n\"quoted\"");
  });

  it("neutralises spreadsheet formula injection in every user-controlled column", async () => {
    await seed(alice.id, [
      { company: "=HYPERLINK(\"http://evil\",\"x\")", role: "+cmd|' /C calc'!A0", applicationDate: "2026-03-05", jobUrl: "https://e.com", notes: "@SUM(1+1)" },
      { company: "-2+3", role: "\t=1+1", applicationDate: "2026-03-04", notes: "  =1+1" },
    ]);
    const records = parseCsv((await exportCsv(A).expect(200)).body).slice(1);
    for (const record of records) {
      for (const idx of [0, 1, 5, 6]) {
        if (record[idx]) expect(record[idx]).not.toMatch(/^[\t\r]|^\s*[=+\-@]/);
      }
    }
    expect(records[0][0]).toBe("'=HYPERLINK(\"http://evil\",\"x\")");
    expect(unescapeFormula(records[0][1])).toBe("+cmd|' /C calc'!A0");
    expect(records[0][6]).toBe("'@SUM(1+1)");
  });

  it("streams every record (no pagination gaps), newest application date first", async () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({
      company: `Co ${String(i).padStart(3, "0")}`,
      role: "Dev",
      applicationDate: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    }));
    await seed(alice.id, rows);
    const res = await exportCsv(A).expect(200);
    const records = parseCsv(res.body);
    expect(res.headers["x-record-count"]).toBe("450");
    expect(records).toHaveLength(451);
    expect(new Set(records.slice(1).map((r) => r[0])).size).toBe(450);
    const dates = records.slice(1).map((r) => r[2]);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

// ===================================================================== import: file level
describe("POST /api/applications/import: file-level checks", () => {
  const good = `${HEADER}\nAcme,Dev,2026-03-05,,Applied,,\n`;

  it("requires authentication and CSRF", async () => {
    const anon = await anonymous(app);
    await postCsv(anon, good).expect(401);
    await alice.agent.post("/api/applications/import").set("Content-Type", "text/csv").send(good).expect(403);
  });

  it("requires a text/csv body", async () => {
    const res = await A.post("/api/applications/import", { company: "x" }).expect(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it.each([
    ["an empty body", "", "CSV_EMPTY"],
    ["only blank lines", "\n\n", "CSV_EMPTY"],
    ["a header with no rows", `${HEADER}\n`, "CSV_EMPTY"],
    ["a missing required column", "company,role\nAcme,Dev\n", "CSV_INVALID_HEADERS"],
    ["a duplicated column", "company,role,jobTitle,applicationDate\nA,B,C,2026-01-01\n", "CSV_INVALID_HEADERS"],
    ["an unterminated quote", `${HEADER}\n"Acme,Dev,2026-03-05,,Applied,,\n`, "CSV_MALFORMED"],
    ["binary content", `${HEADER}\nAcme\u0000,Dev,2026-03-05,,,,\n`, "CSV_NOT_TEXT"],
  ])("rejects %s", async (_label, csv, code) => {
    const res = await postCsv(A, csv).expect(400);
    expect(res.body.error.code).toBe(code);
    expect(await countFor(alice)).toBe(0);
  });

  it("explains which headers are required", async () => {
    const res = await postCsv(A, "company,notes\nAcme,x\n").expect(400);
    expect(res.body.error.message).toMatch(/role, applicationDate/);
  });

  it("rejects files with more rows than the configured limit (100 in tests)", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => `Co${i},Dev,2026-01-01`).join("\n");
    const res = await postCsv(A, `company,role,applicationDate\n${rows}\n`).expect(400);
    expect(res.body.error.code).toBe("CSV_TOO_MANY_ROWS");
    const ok = Array.from({ length: 100 }, (_, i) => `Co${i},Dev,2026-01-01`).join("\n");
    await postCsv(A, `company,role,applicationDate\n${ok}\n`).expect(200); // exactly at the limit
  });

  it("rejects bodies above the byte limit (20 000 in tests) with 413", async () => {
    const res = await postCsv(A, `${HEADER}\n${"x".repeat(25000)},Dev,2026-01-01,,,,\n`).expect(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it.each([["commit=maybe"], ["duplicates=overwrite"], ["userId=abc"]])("validates query %s", async (qs) => {
    await postCsv(A, good, `?${qs}`).expect(400);
  });
});

// ===================================================================== import: preview and commit
describe("POST /api/applications/import: preview and commit", () => {
  const csv3 = `${HEADER}\nAcme,Frontend,2026-03-05,2026-04-01,Interview,https://e.com/1,note\nGlobex,Backend,2026-03-06,,,,\nInitech,Data,2026-03-07,,offer,,\n`;

  it("previews by default and writes nothing", async () => {
    const { body } = await postCsv(A, csv3).expect(200);
    expect(body.data).toMatchObject({ committed: false, totalRows: 3, validRows: 3, invalidRows: 0, duplicateRows: 0, importable: 3, duplicatePolicy: "skip" });
    expect(body.data.preview).toHaveLength(3);
    expect(body.data).not.toHaveProperty("imported");
    expect(await countFor(alice)).toBe(0);
  });

  it("imports valid rows with commit=true, owned by the session user, with Phase 2 defaults", async () => {
    const res = await postCsv(A, csv3, "?commit=true").expect(200);
    expect(res.body.data).toMatchObject({ committed: true, imported: 3, rejected: 0, skippedDuplicates: 0, failedWrites: 0, outcome: "completed" });
    const docs = await Application.find({ userId: alice.id }).sort({ applicationDate: 1 }).lean();
    expect(docs.map((d) => d.company)).toEqual(["Acme", "Globex", "Initech"]);
    expect(docs[0]).toMatchObject({ status: "Interview", jobUrl: "https://e.com/1", notes: "note" });
    expect(docs[0].deadline.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(docs[1]).toMatchObject({ status: "Applied", deadline: null, jobUrl: "", notes: "" });
    expect(docs[2].status).toBe("Offer"); // "offer" normalised to the canonical status
    expect(await countFor(bob)).toBe(0);
  });

  it("keeps the list and analytics consistent after an import", async () => {
    await postCsv(A, csv3, "?commit=true").expect(200);
    const list = await A.get("/api/applications").expect(200);
    expect(list.body.data.pagination.total).toBe(3);
    const stats = await A.get("/api/analytics/overview?today=2026-03-10").expect(200);
    expect(stats.body.data.totals.byStatus).toMatchObject({ Interview: 1, Applied: 1, Offer: 1 });
  });

  it("accepts header variants, CRLF line endings, a BOM, quoted fields and Unicode", async () => {
    const csv = `\uFEFFCompany,Job Title,application_date,Deadline,STATUS,Job URL,Notes\r\n"Acme, Inc.",Zürich 日本語 🚀,2026-03-05,,Applied,,"multi\r\nline ""note"""\r\n`;
    await postCsv(A, csv, "?commit=true").expect(200);
    const doc = await Application.findOne({ userId: alice.id }).lean();
    expect(doc).toMatchObject({ company: "Acme, Inc.", role: "Zürich 日本語 🚀" });
    expect(doc.notes).toBe('multi\r\nline "note"');
  });

  it("reports invalid rows with row numbers and field messages, and imports only the valid ones", async () => {
    const csv = [
      HEADER,
      "Good,Dev,2026-03-05,,Applied,,", // row 2 ok
      ",Dev,2026-03-05,,Applied,,", // row 3 missing company
      "BadStatus,Dev,2026-03-05,,Ghosted,,", // row 4
      "BadDate,Dev,03/05/2026,,Applied,,", // row 5
      "BadUrl,Dev,2026-03-05,,Applied,javascript:alert(1),", // row 6
      "BadDeadline,Dev,2026-03-05,2026-02-30,Applied,,", // row 7
      "Short,Dev,2026-03-05", // row 8 wrong column count
      `${"x".repeat(121)},Dev,2026-03-05,,Applied,,`, // row 9 too long
      "AlsoGood,Dev,2026-03-06,,,,", // row 10 ok
    ].join("\n");
    const preview = (await postCsv(A, csv).expect(200)).body.data;
    expect(preview).toMatchObject({ totalRows: 9, validRows: 2, invalidRows: 7, importable: 2 });
    const byRow = Object.fromEntries(preview.errors.map((e) => [e.row, e.errors]));
    expect(byRow[3].company).toBeTruthy();
    expect(byRow[4].status).toMatch(/must be one of/);
    expect(byRow[5].applicationDate).toBeTruthy();
    expect(byRow[6].jobUrl).toBeTruthy();
    expect(byRow[7].deadline).toBeTruthy();
    expect(byRow[8]._row).toMatch(/Expected 7 columns but found 3/);
    expect(byRow[9].company).toBeTruthy();

    const done = (await postCsv(A, csv, "?commit=true").expect(200)).body.data;
    expect(done).toMatchObject({ imported: 2, rejected: 7, outcome: "completed" });
    expect((await Application.find({ userId: alice.id }).lean()).map((d) => d.company).sort()).toEqual(["AlsoGood", "Good"]);
  });

  it("caps the reported errors but still counts them all", async () => {
    const rows = Array.from({ length: 80 }, () => ",Dev,2026-01-01").join("\n");
    const { data } = (await postCsv(A, `company,role,applicationDate\n${rows}\n`).expect(200)).body;
    expect(data.invalidRows).toBe(80);
    expect(data.errors).toHaveLength(50);
    expect(data.errorsTruncated).toBe(true);
    expect(data.importable).toBe(0);
  });

  it("reports 'nothing-to-import' when every row is invalid", async () => {
    const res = await postCsv(A, "company,role,applicationDate\n,,\n", "?commit=true").expect(200);
    expect(res.body.data).toMatchObject({ imported: 0, rejected: 1, outcome: "nothing-to-import" });
  });

  it("cannot be used to set ownership or protected fields: such columns are ignored and reported", async () => {
    const csv = `company,role,applicationDate,userId,_id,id,createdAt,updatedAt,isAdmin\nSpoof,Dev,2026-03-05,${bob.id},507f1f77bcf86cd799439011,abc,2000-01-01,2000-01-01,true\n`;
    const { data } = (await postCsv(A, csv, "?commit=true").expect(200)).body;
    expect(data.ignoredColumns).toEqual(["userId", "_id", "id", "createdAt", "updatedAt", "isAdmin"]);
    expect(data.imported).toBe(1);
    const doc = await Application.findOne({ company: "Spoof" }).lean();
    expect(String(doc.userId)).toBe(alice.id);
    expect(String(doc._id)).not.toBe("507f1f77bcf86cd799439011");
    expect(doc.createdAt.getFullYear()).toBeGreaterThan(2020);
    expect(await countFor(bob)).toBe(0);
    await B.get("/api/applications").expect(200).then((r) => expect(r.body.data.applications).toEqual([]));
  });

  describe("duplicate handling", () => {
    beforeEach(async () => {
      await seed(alice.id, [{ company: "Acme", role: "Engineer", applicationDate: "2026-03-05", notes: "original" }]);
    });
    const csv = [
      HEADER,
      "ACME,engineer,2026-03-05,,Applied,,replacement", // same company+role+date, different case: duplicate of existing
      "Acme,Engineer,2026-03-06,,Applied,,", // different date: NOT a duplicate
      "Acme,Designer,2026-03-05,,Applied,,", // different role: NOT a duplicate
      "NewCo,Dev,2026-03-07,,Applied,,",
      "newco,DEV,2026-03-07,,Applied,,", // repeats the previous row: in-file duplicate
    ].join("\n");

    it("skips probable duplicates by default and reports them", async () => {
      const { data } = (await postCsv(A, csv, "?commit=true").expect(200)).body;
      expect(data).toMatchObject({ validRows: 5, duplicateRows: 2, imported: 3, skippedDuplicates: 2, duplicatePolicy: "skip" });
      expect(data.duplicates.map((d) => [d.row, d.reason])).toEqual([[2, "existing"], [6, "in-file"]]);
      expect(await countFor(alice)).toBe(4); // 1 existing + 3 imported
    });

    it("never overwrites an existing application", async () => {
      await postCsv(A, csv, "?commit=true&duplicates=skip").expect(200);
      await postCsv(A, csv, "?commit=true&duplicates=import").expect(200);
      const original = await Application.findOne({ userId: alice.id, company: "Acme", role: "Engineer", notes: "original" });
      expect(original).toBeTruthy();
    });

    it("imports duplicates when duplicates=import is chosen", async () => {
      const { data } = (await postCsv(A, csv, "?commit=true&duplicates=import").expect(200)).body;
      expect(data).toMatchObject({ duplicateRows: 2, imported: 5, skippedDuplicates: 0 });
      expect(await countFor(alice)).toBe(6);
    });

    it("duplicate detection only considers the caller's own records", async () => {
      const { data } = (await postCsv(B, csv, "?commit=true").expect(200)).body;
      expect(data).toMatchObject({ imported: 4, duplicateRows: 1 }); // only the in-file duplicate
    });

    it("previews report the same duplicate counts without writing", async () => {
      const { data } = (await postCsv(A, csv).expect(200)).body;
      expect(data).toMatchObject({ duplicateRows: 2, importable: 3, committed: false });
      expect(await countFor(alice)).toBe(1);
    });
  });

  describe("write failures are reported accurately", () => {
    it("reports a total database failure (207, nothing imported, no internals leaked)", async () => {
      vi.spyOn(Application, "insertMany").mockRejectedValueOnce(new Error("mongodb://user:secret@cluster exploded"));
      const res = await postCsv(A, csv3, "?commit=true").expect(207);
      expect(res.body.data).toMatchObject({ imported: 0, failedWrites: 3, outcome: "failed" });
      expect(res.body.data.dbErrors[0]).toMatchObject({ fromRow: 2, toRow: 4, notSaved: 3 });
      expect(JSON.stringify(res.body)).not.toMatch(/secret|exploded|mongodb:/);
    });

    it("reports a partial write using the driver's inserted count", async () => {
      vi.spyOn(Application, "insertMany").mockRejectedValueOnce(Object.assign(new Error("partial"), { insertedDocs: [{}, {}] }));
      const res = await postCsv(A, csv3, "?commit=true").expect(207);
      expect(res.body.data).toMatchObject({ imported: 2, failedWrites: 1, outcome: "partial" });
    });
  });

  it("round-trips an export, including hostile cells, into another account without changes", async () => {
    await seed(alice.id, [
      { company: 'Acme, "Inc."', role: "=SUM(A1)", applicationDate: "2026-03-05", deadline: "2026-04-01", status: "Offer", jobUrl: "https://e.com/x?a=1,2", notes: "@x\nline2 日本語" },
      { company: "-Negative", role: "+Plus", applicationDate: "2026-03-04", notes: "" },
    ]);
    const exported = (await exportCsv(A).expect(200)).body;
    const { data } = (await postCsv(B, exported, "?commit=true").expect(200)).body;
    expect(data).toMatchObject({ imported: 2, rejected: 0 });
    const strip = (docs) =>
      docs.map((d) => ({ company: d.company, role: d.role, applicationDate: d.applicationDate.toISOString(), deadline: d.deadline?.toISOString() ?? null, status: d.status, jobUrl: d.jobUrl, notes: d.notes }));
    const a = await Application.find({ userId: alice.id }).sort({ applicationDate: 1 }).lean();
    const b = await Application.find({ userId: bob.id }).sort({ applicationDate: 1 }).lean();
    expect(strip(b)).toEqual(strip(a));
  });
});
