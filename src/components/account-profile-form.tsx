"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { accountProfileSchema, type AccountProfile } from "@/lib/account-profile";

export function AccountProfileForm({ initial, email }: { initial: AccountProfile; email: string }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return <form className="panel mt-8 space-y-5 p-6" onSubmit={async (event) => {
    event.preventDefault();
    if (saving) return;
    setMessage(""); setError("");
    const parsed = accountProfileSchema.safeParse(value);
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/account/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save profile.");
      setValue(result.profile); setMessage("Your profile has been saved."); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save profile."); }
    finally { setSaving(false); }
  }}>
    <h2 className="text-lg font-bold">Account information</h2>
    <fieldset disabled={saving} className="grid gap-5 sm:grid-cols-2">
      {([
        ["firstName", "First name", "given-name", 100], ["lastName", "Last name", "family-name", 100],
        ["organization", "Organization", "organization", 200], ["labName", "Laboratory", "off", 200], ["phone", "Phone (optional)", "tel", 50],
      ] as const).map(([key, label, autoComplete, maxLength]) => <label className="field-label" key={key}>{label}<input className="field-input mt-2" name={key} type={key === "phone" ? "tel" : "text"} autoComplete={autoComplete} maxLength={maxLength} required={key !== "phone"} value={value[key]} onChange={(e) => { setValue({ ...value, [key]: e.target.value }); setMessage(""); setError(""); }} /></label>)}
      <label className="field-label">Login email<input className="field-input mt-2 bg-slate-50" value={email} readOnly aria-describedby="profile-email-note" /><span id="profile-email-note" className="mt-2 block text-xs font-normal text-slate-500">Read-only. Email changes are not available yet.</span></label>
    </fieldset>
    <p className="text-xs text-slate-500">Pickup and billing defaults are saved separately below.</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
    <button className="button-primary" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
  </form>;
}
