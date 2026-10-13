import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import SubmitButton from "../components/SubmitButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { validateLogin } from "../lib/validators.js";

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const notice = location.state?.notice;

  const onChange = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found = validateLogin(values);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) return document.getElementById(firstInvalid)?.focus();

    setSubmitting(true);
    try {
      await login({ email: values.email.trim(), password: values.password });
      // On success the auth state changes and PublicOnlyRoute redirects to the dashboard.
    } catch (err) {
      setFormError(err?.message || "Something went wrong. Please try again.");
      setErrors(err?.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your job applications."
      footer={
        <>
          New to ApplyTrack?{" "}
          <Link to="/register" className="font-medium text-indigo-700 underline-offset-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && <Alert tone="info">{notice}</Alert>}
        {formError && <Alert>{formError}</Alert>}
        <FormField id="email" label="Email" type="email" autoComplete="email" inputMode="email" value={values.email} onChange={onChange} error={errors.email} disabled={submitting} />
        <FormField id="password" label="Password" type="password" autoComplete="current-password" value={values.password} onChange={onChange} error={errors.password} disabled={submitting} />
        <SubmitButton loading={submitting} loadingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
