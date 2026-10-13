import { useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import SubmitButton from "../components/SubmitButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { validateRegister } from "../lib/validators.js";

export default function RegisterPage() {
  const { register } = useAuth();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found = validateRegister(values);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) return document.getElementById(firstInvalid)?.focus();

    setSubmitting(true);
    try {
      await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
      // Registration signs the user in; PublicOnlyRoute then redirects to the dashboard.
    } catch (err) {
      setFormError(err?.message || "Something went wrong. Please try again.");
      setErrors(err?.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start keeping track of every application in one place."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-700 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <FormField id="name" label="Full name" type="text" autoComplete="name" value={values.name} onChange={onChange} error={errors.name} disabled={submitting} />
        <FormField id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={values.email} onChange={onChange} error={errors.email} disabled={submitting} />
        <FormField id="password" label="Password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." value={values.password} onChange={onChange} error={errors.password} disabled={submitting} />
        <FormField id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={onChange} error={errors.confirmPassword} disabled={submitting} />
        <SubmitButton loading={submitting} loadingText="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
