import { describe, expect, it } from "vitest";
import { databaseNameFromUri } from "../src/utils/mongoUri.js";

describe("databaseNameFromUri", () => {
  it("extracts the database name from Atlas and local URIs", () => {
    expect(databaseNameFromUri("mongodb+srv://u:p%40ss@cluster0.abc.mongodb.net/applytrack?retryWrites=true&w=majority")).toBe("applytrack");
    expect(databaseNameFromUri("mongodb://127.0.0.1:27017/applytrack_test")).toBe("applytrack_test");
    expect(databaseNameFromUri("mongodb://a:27017,b:27017,c:27017/mydb?replicaSet=rs0")).toBe("mydb");
  });

  it("returns an empty string when the URI has no database (MongoDB would then use 'test')", () => {
    expect(databaseNameFromUri("mongodb+srv://u:p@cluster0.abc.mongodb.net/?retryWrites=true")).toBe("");
    expect(databaseNameFromUri("mongodb+srv://u:p@cluster0.abc.mongodb.net")).toBe("");
    expect(databaseNameFromUri("mongodb://127.0.0.1:27017")).toBe("");
    expect(databaseNameFromUri("mongodb://127.0.0.1:27017/?x=1")).toBe("");
  });

  it("is not fooled by credentials containing slashes-looking text and returns null for non-Mongo strings", () => {
    expect(databaseNameFromUri("mongodb://user:pa%2Fss@host/db")).toBe("db");
    expect(databaseNameFromUri("postgres://x/y")).toBe(null);
    expect(databaseNameFromUri("not a uri")).toBe(null);
  });
});
