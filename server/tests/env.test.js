import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const JWT = "jwt-secret-value-that-must-never-leak-1234567890";
const CSRF = "csrf-secret-value-that-must-never-leak-123456789";
const prod = {
  NODE_ENV: "production",
  MONGODB_URI: "mongodb+srv://appuser:pw@cluster0.abc.mongodb.net/applytrack?retryWrites=true&w=majority",
  JWT_SECRET: JWT,
  CSRF_SECRET: CSRF,
  CLIENT_ORIGIN: "https://app.example.com",
  COOKIE_SAMESITE: "lax",
  TRUST_PROXY: "1",
};
const bad = (over) => () => parseEnv({ ...prod, ...over });

describe("parseEnv: production rules", () => {
  it("accepts a correct production configuration without warnings", () => {
    const e = parseEnv(prod);
    expect(e.cookieSecure).toBe(true); // secure by default in production
    expect(e.databaseName).toBe("applytrack");
    expect(e.CLIENT_ORIGIN).toEqual(["https://app.example.com"]);
    expect(e.warnings).toEqual([]);
  });

  it("requires an explicit database name (an empty one falls back to MongoDB's 'test' database)", () => {
    expect(bad({ MONGODB_URI: "mongodb+srv://u:p@c.mongodb.net/?retryWrites=true" })).toThrow(/database/i);
    expect(bad({ MONGODB_URI: "mongodb://127.0.0.1:27017" })).toThrow(/database/i);
    expect(bad({ MONGODB_URI: "mongodb+srv://u:p@c.mongodb.net/test?x=1" })).toThrow(/database/i);
    expect(bad({ MONGODB_URI: "mongodb+srv://u:p@c.mongodb.net/admin" })).toThrow(/database/i);
  });

  it("requires https origins and secure cookies", () => {
    expect(bad({ CLIENT_ORIGIN: "http://app.example.com" })).toThrow(/https/);
    expect(bad({ COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
    expect(bad({ COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" })).toThrow();
  });

  it("rejects wildcard, malformed and path-bearing origins", () => {
    expect(bad({ CLIENT_ORIGIN: "*" })).toThrow(/explicit/);
    expect(bad({ CLIENT_ORIGIN: "https://a.example.com,*" })).toThrow(/explicit/);
    expect(bad({ CLIENT_ORIGIN: "not-an-origin" })).toThrow(/origin/);
    expect(bad({ CLIENT_ORIGIN: "https://app.example.com/app" })).toThrow(/path/);
  });

  it("accepts several explicit origins and strips trailing slashes", () => {
    expect(parseEnv({ ...prod, CLIENT_ORIGIN: "https://a.example.com/, https://b.example.com" }).CLIENT_ORIGIN).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("warns (does not fail) about a missing proxy setting, weak bcrypt cost and localhost origins", () => {
    expect(parseEnv({ ...prod, TRUST_PROXY: "0" }).warnings.join(" ")).toMatch(/TRUST_PROXY/);
    expect(parseEnv({ ...prod, BCRYPT_ROUNDS: "8" }).warnings.join(" ")).toMatch(/BCRYPT_ROUNDS/);
    expect(parseEnv({ ...prod, CLIENT_ORIGIN: "http://localhost:5173" }).warnings.join(" ")).toMatch(/localhost/);
  });
});

describe("parseEnv: secrets and required values", () => {
  it("fails when required values are missing", () => {
    for (const key of ["MONGODB_URI", "JWT_SECRET", "CSRF_SECRET", "CLIENT_ORIGIN"]) {
      const { [key]: _omitted, ...rest } = prod;
      expect(() => parseEnv(rest)).toThrow(new RegExp(key));
    }
  });

  it("rejects short, placeholder and identical secrets", () => {
    expect(bad({ JWT_SECRET: "short" })).toThrow(/at least 32/);
    expect(bad({ JWT_SECRET: "CHANGE_ME_generate_with_openssl_rand_hex_32" })).toThrow(/placeholder/);
    expect(bad({ CSRF_SECRET: JWT })).toThrow(/different/);
  });

  it("never echoes secret values in error messages", () => {
    for (const over of [{ CLIENT_ORIGIN: "http://x.example.com" }, { MONGODB_URI: "mongodb://u:p@h" }, { CSRF_SECRET: JWT }, { PORT: "abc" }]) {
      let message = "";
      try {
        parseEnv({ ...prod, ...over });
      } catch (e) {
        message = e.message;
      }
      expect(message).not.toContain(JWT);
      expect(message).not.toContain(CSRF);
      expect(message).not.toContain("appuser");
    }
  });

  it("treats empty strings as unset and applies defaults", () => {
    const e = parseEnv({ ...prod, COOKIE_DOMAIN: "", PORT: "" });
    expect(e.COOKIE_DOMAIN).toBe(undefined);
    expect(e.PORT).toBe(5000);
    expect(e.IMPORT_MAX_ROWS).toBe(1000);
    expect(e.REMINDER_WINDOW_DAYS).toBe(7);
    expect(e.LOGIN_FAILURE_LIMIT).toBe(10);
  });

  it("warns outside production when the URI has no database name", () => {
    const e = parseEnv({ ...prod, NODE_ENV: "development", MONGODB_URI: "mongodb://127.0.0.1:27017" });
    expect(e.warnings.join(" ")).toMatch(/default 'test' database/);
  });
});
