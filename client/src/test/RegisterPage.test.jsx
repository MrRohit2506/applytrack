import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext.jsx";
import { ApiError } from "../lib/apiClient.js";
import RegisterPage from "../pages/RegisterPage.jsx";

function setup(register = vi.fn()) {
  render(
    <AuthContext.Provider value={{ register, status: "unauthenticated" }}>
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return register;
}
const fill = (v) => {
  const map = { name: "Full name", email: "Email", password: "Password", confirmPassword: "Confirm password" };
  for (const [k, label] of Object.entries(map)) if (k in v) fireEvent.change(screen.getByLabelText(label), { target: { value: v[k] } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: /create account|creating account/i }));
const valid = { name: "Ada Lovelace", email: "ada@example.com", password: "Sup3rSecret!", confirmPassword: "Sup3rSecret!" };

describe("RegisterPage", () => {
  it("requires every field", () => {
    const register = setup();
    submit();
    for (const msg of ["Name is required", "Email is required", "Password is required", "Confirm your password"]) expect(screen.getByText(msg)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("enforces the password policy and matching confirmation", () => {
    const register = setup();
    fill({ ...valid, password: "short", confirmPassword: "short" });
    submit();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    fill({ password: "onlyletters", confirmPassword: "onlyletters" });
    submit();
    expect(screen.getByText("Password must include at least one letter and one number")).toBeInTheDocument();
    fill({ password: "Sup3rSecret!", confirmPassword: "Different1!" });
    submit();
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("sends only name, email and password (never the confirmation)", async () => {
    const register = setup(vi.fn().mockResolvedValue());
    fill({ ...valid, name: "  Ada Lovelace ", email: " ada@example.com " });
    submit();
    await waitFor(() => expect(register).toHaveBeenCalledWith({ name: "Ada Lovelace", email: "ada@example.com", password: "Sup3rSecret!" }));
  });

  it("shows a duplicate-email error on the email field and keeps the form usable", async () => {
    setup(vi.fn().mockRejectedValue(new ApiError("An account with this email already exists.", { status: 409, code: "EMAIL_TAKEN", fieldErrors: { email: "An account with this email already exists." } })));
    fill(valid);
    submit();
    expect(await screen.findAllByText("An account with this email already exists.")).not.toHaveLength(0);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
  });

  it("disables submit while the request is in flight", async () => {
    let resolve;
    const register = setup(vi.fn(() => new Promise((r) => (resolve = r))));
    fill(valid);
    submit();
    const busy = await screen.findByRole("button", { name: /creating account/i });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(register).toHaveBeenCalledTimes(1);
    resolve();
  });
});
