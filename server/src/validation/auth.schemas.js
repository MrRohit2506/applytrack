import { z } from "zod";

const email = z
  .string({ required_error: "Email is required", invalid_type_error: "Email must be text" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address");

const newPassword = z
  .string({ required_error: "Password is required", invalid_type_error: "Password must be text" })
  .min(8, "Password must be at least 8 characters")
  // bcrypt only uses the first 72 bytes; reject longer input instead of silently truncating.
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 bytes")
  .refine(
    (v) => /[A-Za-z]/.test(v) && /\d/.test(v),
    "Password must include at least one letter and one number",
  );

export const registerSchema = z.object({
  name: z
    .string({ required_error: "Name is required", invalid_type_error: "Name must be text" })
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be at most 80 characters"),
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z
    .string({ required_error: "Password is required", invalid_type_error: "Password must be text" })
    .min(1, "Password is required")
    .max(128, "Password is too long"),
});
