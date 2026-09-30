import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { IconArrowLeft, IconCheck, IconUserPlus } from "@/assets/Icons";
import { apiFetch } from "@/api/client";
import { useAuth } from "@/auth/useAuth";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";

interface SignupValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const EMPTY: SignupValues = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

/** Mirrors the RRIV API's POST /account validation rules. */
function validate(values: SignupValues): Partial<Record<keyof SignupValues, string>> {
  const errors: Partial<Record<keyof SignupValues, string>> = {};

  if (values.firstName.trim().length < 3) {
    errors.firstName = "At least 3 characters.";
  } else if (values.firstName.trim().length > 20) {
    errors.firstName = "At most 20 characters.";
  }

  if (values.lastName.trim().length < 3) {
    errors.lastName = "At least 3 characters.";
  } else if (values.lastName.trim().length > 20) {
    errors.lastName = "At most 20 characters.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (values.password.length < 5) {
    errors.password = "At least 5 characters.";
  }

  return errors;
}

export function SignupPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<SignupValues>(EMPTY);
  const [errors, setErrors] = useState<
    Partial<Record<keyof SignupValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  if (status === "authenticated") {
    return <Navigate to="/contexts" replace />;
  }

  function update<K extends keyof SignupValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      // POST /account is unauthenticated — the API creates the Keycloak user,
      // the local account row, and sends the verify-email action.
      await apiFetch(() => Promise.resolve(null), "/account", {
        method: "POST",
        body: JSON.stringify({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim(),
          password: values.password,
        }),
      });
      setSucceeded(true);
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "We could not create your account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (succeeded) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
        <Card className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <IconCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-xl font-semibold text-fg">
            Account created
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            We sent a verification link to{" "}
            <span className="font-medium text-fg">{values.email.trim()}</span>.
            You can sign in now and verify later.
          </p>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="btn btn-primary mt-6 w-full"
          >
            Continue to sign in
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <Card>
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          <IconUserPlus className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-fg">Create account</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Set up your RRIV account to manage devices and contexts.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="firstName"
              label="First name"
              value={values.firstName}
              error={errors.firstName}
              autoComplete="given-name"
              onChange={(value) => update("firstName", value)}
            />
            <Field
              id="lastName"
              label="Last name"
              value={values.lastName}
              error={errors.lastName}
              autoComplete="family-name"
              onChange={(value) => update("lastName", value)}
            />
          </div>
          <Field
            id="email"
            label="Email"
            type="email"
            value={values.email}
            error={errors.email}
            autoComplete="email"
            onChange={(value) => update("email", value)}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={values.password}
            error={errors.password}
            autoComplete="new-password"
            onChange={(value) => update("password", value)}
          />

          {formError ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300"
            >
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary w-full"
          >
            {submitting ? <Spinner /> : "Create account"}
          </button>

          <p className="text-center text-xs text-fg-subtle">
            The API will email you a verification link. You can sign in
            immediately.
          </p>
        </form>

        <div className="my-5 h-px bg-border" />

        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition hover:text-fg"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-fg-muted"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="field"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
