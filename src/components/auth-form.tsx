"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const data = new FormData(event.currentTarget);
    const response = await authClient.signIn.email({
      email: String(data.get("email")),
      password: String(data.get("password")),
      rememberMe: true,
    });

    if (response.error) {
      setError(response.error.message || "Unable to sign in. Check your email and password.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-5">
      <Field label="Email address" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      {error ? <FormError message={error} /> : null}
      <button type="submit" disabled={loading} className="button-primary w-full justify-center">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        Sign in
        {!loading ? <ArrowRight className="h-4 w-4" /> : null}
      </button>
      <p className="text-center text-sm text-slate-600">
        Need an account?{" "}
        <Link href="/register" className="font-semibold text-cyan-700 hover:text-cyan-800">
          Register
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));

    if (password !== String(data.get("confirmPassword"))) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const firstName = String(data.get("firstName")).trim();
    const lastName = String(data.get("lastName")).trim();
    const phone = String(data.get("phone")).trim();
    const response = await authClient.signUp.email({
      name: `${firstName} ${lastName}`,
      email: String(data.get("email")).trim(),
      password,
      firstName,
      lastName,
      organization: String(data.get("organization")).trim(),
      labName: String(data.get("labName")).trim(),
      phone: phone || undefined,
    });

    if (response.error) {
      setError(response.error.message || "Unable to create your account.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="given-name" required />
        <Field label="Last name" name="lastName" autoComplete="family-name" required />
      </div>
      <Field label="Email address" name="email" type="email" autoComplete="email" required />
      <Field label="Organization / institution" name="organization" autoComplete="organization" required />
      <Field label="Lab name" name="labName" required />
      <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters"
          required
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {error ? <FormError message={error} /> : null}
      <button type="submit" disabled={loading} className="button-primary w-full justify-center">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        Create account
        {!loading ? <ArrowRight className="h-4 w-4" /> : null}
      </button>
      <p className="text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-cyan-700 hover:text-cyan-800">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="mb-2 block">{label}</span>
      <input {...props} className="field-input" />
      {hint ? <span className="mt-1.5 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
