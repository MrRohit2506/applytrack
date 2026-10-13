import { AppError } from "../utils/AppError.js";

/**
 * Validates req.body (default) or req.query with a Zod schema.
 *  - body: req.body is replaced by the parsed data.
 *  - query: parsed data is placed on req.validatedQuery.
 * Unknown keys rejected by `.strict()` schemas are reported as field errors.
 */
export const validate = (schema, source = "body") => (req, _res, next) => {
  const input = source === "query" ? req.query : req.body;
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const fieldErrors = {};
    for (const issue of result.error.issues) {
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) fieldErrors[key] ??= "Unknown or read-only field.";
        continue;
      }
      const key = String(issue.path[0] ?? "_form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const message = source === "query" ? "Invalid query parameters." : "Please correct the highlighted fields.";
    return next(new AppError(400, "VALIDATION_ERROR", message, fieldErrors));
  }
  if (source === "query") req.validatedQuery = result.data;
  else req.body = result.data;
  next();
};
