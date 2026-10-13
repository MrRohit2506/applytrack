import { AppError } from "../utils/AppError.js";

// Strict 24-hex check (mongoose.isValidObjectId also accepts any 12-character string).
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export function validateObjectId(req, _res, next) {
  if (!OBJECT_ID_RE.test(req.params.id)) return next(new AppError(400, "INVALID_ID", "Invalid application id."));
  next();
}
