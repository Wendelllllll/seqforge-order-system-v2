"use client";

import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";

const loginLink = (next: string | null) => next ? `/login?next=${encodeURIComponent(next)}` : "/login";
const requestLink = (next: string | null) => next ? `/forgot-password?next=${encodeURIComponent(next)}` : "/forgot-password";

export function ForgotPasswordForm({ next }: { next: string | null }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const email = String(new FormData(event.currentTarget).get("email") || "");
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/account/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...(next ? { next } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to request a reset link. Please try again.");
      setSent(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to connect. Please try again."); }
    finally { setLoading(false); }
  }
  return <div className="space-y-5">
    {sent ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900"><CheckCircle2 className="mb-3 h-6 w-6" /><p className="font-semibold">Check your inbox</p><p>If this email has a SeqForge account, a reset link will be sent. Please check your junk folder too. The link is valid for one hour.</p><button className="mt-3 font-semibold underline underline-offset-4" onClick={() => setSent(false)}>Try another address or request a new link</button></div> : <form method="post" onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-semibold text-slate-700">Account email<input className="field-input mt-2" type="email" name="email" autoComplete="email" maxLength={254} required /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={loading} className="button-primary w-full justify-center">{loading && <LoaderCircle size={17} className="animate-spin" />} Send reset link</button>
    </form>}
    <p className="text-sm leading-6 text-slate-500">Your orders and drafts stay saved. Opening a reset link does not change your password.</p>
    <Link className="inline-block text-sm font-semibold text-cyan-700" href={loginLink(next)}>Back to sign in</Link>
  </div>;
}

export function ResetPasswordForm({ token, next }: { token: string; next: string | null }) {
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword") || "");
    setError("");
    if (newPassword !== String(data.get("confirmPassword") || "")) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/account/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to reset your password. Please try again.");
      form.reset();
      window.history.replaceState(null, "", next ? `/reset-password?next=${encodeURIComponent(next)}` : "/reset-password");
      setComplete(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to connect. Please try again."); }
    finally { setLoading(false); }
  }
  if (complete) return <div className="space-y-5"><div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900"><CheckCircle2 className="mb-3 h-6 w-6" /><p className="font-semibold">Your password has been reset</p><p>Sign in with your new password. Previous sign-in sessions have ended. Your orders and drafts are preserved.</p></div><Link className="button-primary w-full justify-center" href={loginLink(next)}>Sign in with your new password</Link></div>;
  return <form method="post" onSubmit={submit} className="space-y-5">
    <label className="block text-sm font-semibold text-slate-700">New password<input className="field-input mt-2" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /><span className="mt-2 block text-xs font-normal text-slate-500">8–128 characters. Choose a password you do not use elsewhere.</span></label>
    <label className="block text-sm font-semibold text-slate-700">Confirm new password<input className="field-input mt-2" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={loading} className="button-primary w-full justify-center">{loading && <LoaderCircle size={17} className="animate-spin" />} Reset password</button>
    <p className="text-sm leading-6 text-slate-500">This will sign out your existing sessions. Email verification is still required before your first order.</p>
    <Link href={requestLink(next)} className="inline-block text-sm font-semibold text-cyan-700">Link expired? Request a new one</Link>
  </form>;
}
