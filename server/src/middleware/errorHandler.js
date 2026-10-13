import { AppError } from "../utils/AppError.js";
import { errorFields, logger } from "../utils/logger.js";

export const notFound = (_req, _res, next) =>
  next(new AppError(404, "NOT_FOUND", "Resource not found."));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong. Please try again later.";
  let fieldErrors;

  if (err instanceof AppError) {
    ({ status, code, message, fieldErrors } = err);
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body is not valid JSON.";
  } else if (err?.name === "ValidationError" || err?.name === "CastError") {
    // Mongoose-level rejection that slipped past request validation: safe generic 400.
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid data.";
  } else if (err?.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large.";
  } else if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 && err.expose !== false) {
    // Any other client error raised by body-parser/Express (unsupported encoding or charset, aborted
    // request, ...). These used to fall through to a 500.
    status = err.status;
    code = status === 415 ? "UNSUPPORTED_MEDIA_TYPE" : "BAD_REQUEST";
    message = status === 415 ? "Unsupported content type, charset or encoding." : "The request could not be processed.";
  }

  if (status >= 500) {
    // Server-side only. redact() strips connection strings/JWTs; bodies, cookies and queries are never logged.
    logger.error("unhandled error", { requestId: req.id, method: req.method, path: req.path, ...errorFields(err) });
  }

  res.status(status).json({
    error: { code, message, ...(fieldErrors ? { fieldErrors } : {}), ...(status >= 500 && req.id ? { requestId: req.id } : {}) },
  });
}
