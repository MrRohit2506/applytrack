import { describe, expect, it } from "vitest";
import { errorFields, redact } from "../src/utils/logger.js";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ0diI6MCwic3ViIjoiNjQifQ.abcDEF123_-signature";

describe("log redaction", () => {
  it("removes MongoDB connection strings including credentials", () => {
    const out = redact("connect failed: mongodb+srv://admin:Hunter2@cluster0.x.mongodb.net/db?retryWrites=true timed out");
    expect(out).toBe("connect failed: mongodb://[redacted] timed out");
    expect(out.includes("Hunter2")).toBe(false);
  });

  it("removes JWTs and credential-looking key/value pairs", () => {
    expect(redact(`token ${JWT} seen`).includes("eyJ")).toBe(false);
    expect(redact("password=hunter2 next")).toBe("password=[redacted] next");
    expect(redact("Authorization: Bearer abc.def")).toBe("Authorization: [redacted]"); // the token itself, not just the scheme
    expect(redact("cookie: applytrack_session=abc123").includes("abc123")).toBe(false);
  });

  it("leaves ordinary text alone", () => {
    expect(redact("GET /api/applications 200 12ms")).toBe("GET /api/applications 200 12ms");
  });

  it("errorFields redacts message and stack", () => {
    const err = new Error("boom mongodb://u:secretpw@h/db");
    const f = errorFields(err);
    expect(f.errorName).toBe("Error");
    expect(JSON.stringify(f).includes("secretpw")).toBe(false);
  });
});
