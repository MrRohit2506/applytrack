/** Operational error with a safe, client-facing message. */
export class AppError extends Error {
  constructor(status, code, message, fieldErrors) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
