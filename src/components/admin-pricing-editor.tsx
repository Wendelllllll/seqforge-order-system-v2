"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/pricing";
import { ACTIVE_RATE_ITEMS, dollarsToCents, RATE_ITEMS, type RateSchedule } from "@/lib/rate-schedule";

export function AdminPricingEditor({ initial }: { initial: RateSchedule }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initial);
  const valuesFor = (value: RateSchedule) => Object.fromEntries(RATE_ITEMS.map(item => [item.key, (value.rates[item.key] / 100).toFixed(2)]));
  const [values, setValues] = useState(valuesFor(initial));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<RateSchedule["rates"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const changes = pending ? ACTIVE_RATE_ITEMS.filter(item => pending[item.key] !== schedule.rates[item.key]) : [];
  async function save() {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: schedule.revision, rates: pending, reason }) });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409 && payload.schedule) { setSchedule(payload.schedule); setValues(valuesFor(payload.schedule)); setPending(null); }
        throw new Error(payload.error || "Unable to save prices.");
      }
      setSchedule(payload); setValues(valuesFor(payload)); setPending(null); setReason("");
      setMessage("Prices saved. New submissions use these rates. Existing order prices are unchanged."); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save prices."); }
    finally { setBusy(false); }
  }
  return <section className="panel overflow-hidden">
    <div className="panel-heading"><div><h2 className="text-lg font-bold">Current rates</h2><p className="mt-1 text-sm text-slate-500">USD · Applies immediately after confirmation · Revision {schedule.revision}</p></div><span className="metric-pill">{ACTIVE_RATE_ITEMS.length} rates</span></div>
    <form onSubmit={event => { event.preventDefault(); setError(""); setMessage(""); try { const rates = Object.fromEntries(RATE_ITEMS.map(item => [item.key, dollarsToCents(values[item.key])])) as RateSchedule["rates"]; if (!reason.trim()) throw new Error("Add a reason for the price change."); if (RATE_ITEMS.every(item => rates[item.key] === schedule.rates[item.key])) throw new Error("No prices have changed."); setPending(rates); } catch (error) { setError(error instanceof Error ? error.message : "Check the rates."); } }}>
      <div className="overflow-x-auto"><table className="data-table min-w-[650px]"><thead><tr><th>Service</th><th>Submission type</th><th>Format</th><th>Charge per</th><th>Current USD</th><th>New USD</th></tr></thead><tbody>{ACTIVE_RATE_ITEMS.map(item => <tr key={item.key}><td className="font-semibold">{item.service}</td><td>{item.mode === "Whole plasmid" ? "Purified plasmid DNA · ≤12 kb" : item.mode}</td><td>{item.container === "Plate" ? "96-well plate" : "Tubes / strips"}</td><td>{item.unit}</td><td className="font-mono">{formatMoney(schedule.rates[item.key])}</td><td><input className="field-input w-28" aria-label={`${item.service} ${item.mode} ${item.container} price USD`} inputMode="decimal" value={values[item.key]} disabled={busy || !!pending} onChange={event => { setValues({ ...values, [item.key]: event.target.value }); setMessage(""); }} /></td></tr>)}</tbody></table></div>
      <div className="space-y-4 border-t border-slate-200 p-5"><label className="block"><span className="field-label">Reason for change</span><textarea className="field-input mt-2" maxLength={500} value={reason} disabled={busy || !!pending} onChange={event => setReason(event.target.value)} placeholder="For example: updated standard sequencing rates" /></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {pending ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-bold">Confirm {changes.length} price {changes.length === 1 ? "change" : "changes"}</h3><ul className="my-3 space-y-2 text-sm">{changes.map(item => <li key={item.key}>{item.service} · {item.mode} · {item.container}: <strong>{formatMoney(schedule.rates[item.key])} → {formatMoney(pending[item.key])}</strong> / {item.unit}</li>)}</ul><p className="mb-4 text-sm">Existing orders keep their saved prices. Customers with older drafts must review the latest price before submitting.</p><div className="flex flex-wrap gap-3"><button className="button-primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Confirm and publish prices"}</button><button className="button-secondary" type="button" disabled={busy} onClick={() => setPending(null)}>Back to editing</button></div></div> : <button className="button-primary" type="submit">Review price changes</button>}
      </div>
    </form>
  </section>;
}
