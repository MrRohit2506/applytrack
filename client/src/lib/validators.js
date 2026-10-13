// Client-side validation mirrors the server rules (the server remains the authority).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(v) {
  const s = v.trim();
  if (!s) return "Name is required";
  if (s.length > 80) return "Name must be at most 80 characters";
}

export function validateEmail(v) {
  const s = v.trim();
  if (!s) return "Email is required";
  if (s.length > 254 || !EMAIL_RE.test(s)) return "Enter a valid email address";
}

export function validateNewPassword(v) {
  if (!v) return "Password is required";
  if (v.length < 8) return "Password must be at least 8 characters";
  if (new TextEncoder().encode(v).length > 72) return "Password must be at most 72 bytes";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "Password must include at least one letter and one number";
}

const compact = (errors) => Object.fromEntries(Object.entries(errors).filter(([, m]) => m));

export function validateLogin({ email, password }) {
  return compact({ email: validateEmail(email), password: password ? undefined : "Password is required" });
}

export function validateRegister({ name, email, password, confirmPassword }) {
  return compact({
    name: validateName(name),
    email: validateEmail(email),
    password: validateNewPassword(password),
    confirmPassword: !confirmPassword
      ? "Confirm your password"
      : confirmPassword !== password
        ? "Passwords do not match"
        : undefined,
  });
}
