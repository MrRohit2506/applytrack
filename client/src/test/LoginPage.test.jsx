import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.jsx";
import { ApiError } from "../lib/apiClient.js";
import LoginPage from "../pages/LoginPage.jsx";

function setup(login = vi.fn(), state) {
  render(
    <AuthContext.Provider value={{ login, status: "unauthenticated" }}>
      <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return login;
}
const fill = (email, password) => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: /sign in|signing in/i }));

describe("LoginPage", () => {
  it("has labelled fields and a link to registration", () => {
    setup();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
  });

  it("shows field errors, focuses the first invalid field and does not call the API", () => {
    const login = setup();
    submit();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email locally", () => {
    const login = setup();
    fill("not-an-email", "x");
    submit();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("submits trimmed credentials once and disables the form while the request is pending", async () => {
    let resolve;
    const login = setup(vi.fn(() => new Promise((r) => (resolve = r))));
    fill("  ada@example.com ", "Sup3rSecret!");
    submit();
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: "ada@example.com", password: "Sup3rSecret!" }));
    const busy = screen.getByRole("button", { name: /signing in/i });
    expect(busy).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    fireEvent.click(busy);
    expect(login).toHaveBeenCalledTimes(1);
    resolve();
  });

  it("shows the server's generic error, keeps what was typed and re-enables the button", async () => {
    setup(vi.fn().mockRejectedValue(new ApiError("Invalid email or password.", { status: 401, code: "INVALID_CREDENTIALS" })));
    fill("ada@example.com", "wrong-pass-1");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows throttling and network failures clearly", async () => {
    setup(vi.fn().mockRejectedValueOnce(new ApiError("Too many failed sign-in attempts. Please try again later.", { status: 429 })).mockRejectedValueOnce(new ApiError("Unable to reach the server. Check your connection and try again.", { code: "NETWORK_ERROR" })));
    fill("ada@example.com", "x");
    submit();
    expect(await screen.findByText(/Too many failed sign-in attempts/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
    submit();
    expect(await screen.findByText(/Unable to reach the server/)).toBeInTheDocument();
  });

  it("explains an expired session when redirected here", () => {
    setup(vi.fn(), { notice: "Your session has expired. Please sign in again." });
    expect(screen.getByRole("status")).toHaveTextContent("Your session has expired");
  });
});
