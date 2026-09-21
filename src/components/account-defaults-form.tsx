"use client";
import { useState } from "react";
import { OrderDefaultFields } from "./order-default-fields";
import { orderDefaultsSchema, type OrderDefaults } from "@/lib/order-defaults";

export async function saveOrderDefaults(value: OrderDefaults) {
  const parsed = orderDefaultsSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" "));
  const response = await fetch("/api/account/order-defaults", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Unable to save defaults."); }
}
export function AccountDefaultsForm({ initial }: { initial: OrderDefaults }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return <form className="panel mt-6 space-y-5 p-6" onSubmit={async (e) => {
    e.preventDefault(); setSaving(true); setMessage(""); setError("");
    try { await saveOrderDefaults(value); setMessage("Saved to your account. New orders will use these details; existing orders are unchanged."); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save defaults."); }
    finally { setSaving(false); }
  }}>
    <h2 className="text-lg font-bold">Reusable order details</h2>
    <p className="text-sm text-slate-600">Save pickup and billing details once, then adjust them for individual orders. These defaults belong to your account; they are not shared with other lab members. You can save incomplete details and finish them when ordering.</p>
    <fieldset disabled={saving}><OrderDefaultFields value={value} onChange={(next) => { setValue(next); setMessage(""); setError(""); }} /></fieldset>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
    <button className="button-primary" disabled={saving}>{saving ? "Saving…" : "Save account defaults"}</button>
  </form>;
}
