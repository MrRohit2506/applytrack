import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../components/ErrorBoundary.jsx";

afterEach(() => vi.restoreAllMocks());

function Boom() {
  throw new Error("secret-value-in-message");
}

describe("ErrorBoundary", () => {
  it("renders children normally", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("shows a recoverable message instead of a blank page and logs only the error type", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.queryByText(/secret-value-in-message/)).not.toBeInTheDocument();
    const ours = spy.mock.calls.filter((c) => c[0] === "UI error:");
    expect(ours).toHaveLength(1);
    expect(ours[0]).toEqual(["UI error:", "Error"]);
  });
});
