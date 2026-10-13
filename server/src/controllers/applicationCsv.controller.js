import { once } from "node:events";
import { env } from "../config/env.js";
import { Application } from "../models/Application.js";
import { analyseImport, applicationToCsvLine, buildImportReport, commitImport, csvHeaderLine, planImport } from "../services/applicationCsv.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { todayCalendarDate } from "../utils/dates.js";

/**
 * GET /api/applications/export: ALL of the signed-in user's applications (current list filters are
 * deliberately not applied). Streams from a cursor in small chunks, so memory stays bounded and no
 * pagination is involved (nothing can be silently omitted). Private fields are never selected.
 */
export const exportApplications = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  const [count, cursor] = [
    await Application.countDocuments(filter),
    Application.find(filter)
      .sort({ applicationDate: -1, _id: -1 })
      .select("company role applicationDate deadline status jobUrl notes")
      .lean()
      .cursor(),
  ];

  // Read the first record BEFORE sending headers so a database failure still yields a normal JSON error.
  let doc = await cursor.next();

  res.status(200).set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="applytrack-applications-${todayCalendarDate()}.csv"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Record-Count": String(count),
  });
  res.on("close", () => cursor.close().catch(() => {}));

  // UTF-8 BOM so Excel opens non-ASCII text correctly; the importer strips it again.
  let chunk = `\uFEFF${csvHeaderLine()}`;
  let pending = 0;
  while (doc && !res.destroyed) {
    chunk += applicationToCsvLine(doc);
    if (++pending >= 200) {
      if (!res.write(chunk)) await Promise.race([once(res, "drain"), once(res, "close")]);
      chunk = "";
      pending = 0;
    }
    doc = await cursor.next();
  }
  res.end(chunk);
});

/**
 * POST /api/applications/import (body: the CSV text, Content-Type text/csv)
 *   ?commit=false (default)  validate + report only, nothing is written
 *   ?commit=true             import the valid rows
 *   ?duplicates=skip|import  what to do with probable duplicates (default skip)
 * The client re-sends the file on commit; the server re-validates everything and trusts nothing from the preview.
 */
export const importApplications = asyncHandler(async (req, res) => {
  const { commit, duplicates } = req.validatedQuery;

  const contentType = (req.get("content-type") || "").toLowerCase();
  if (!/^text\/(csv|plain)\b/.test(contentType)) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the file contents with Content-Type: text/csv.");
  }
  const text = typeof req.body === "string" ? req.body : "";

  const analysis = analyseImport(text, { maxRows: env.IMPORT_MAX_ROWS });
  const plan = await planImport(req.user._id, analysis, duplicates);

  if (!commit) return res.json({ data: buildImportReport(analysis, plan, { commit: false, policy: duplicates }) });

  const result = await commitImport(req.user._id, plan.toInsert);
  const report = buildImportReport(analysis, plan, { commit: true, policy: duplicates, result });
  // 207 = some rows were saved and some were not because of a database problem; the body says exactly what happened.
  res.status(result.dbErrors.length ? 207 : 200).json({ data: report });
});
