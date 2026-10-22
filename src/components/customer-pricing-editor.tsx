"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { customerPricingSchema, type CustomerPricing } from "@/lib/customer-pricing";
import { formatMoney } from "@/lib/pricing";
import { ACTIVE_RATE_ITEMS, dollarsToCents, type RateKey, type RateSchedule } from "@/lib/rate-schedule";

type Overrides = CustomerPricing["overrides"];
const valuesFor = (pricing: CustomerPricing) => Object.fromEntries(ACTIVE_RATE_ITEMS.map(item => [item.key, pricing.overrides[item.key] === undefined ? "" : (pricing.overrides[item.key]! / 100).toFixed(2)]));
const describeType = (mode: string) => mode === "Whole plasmid" ? "Purified plasmid DNA · ≤12 kb" : mode === "Whole plasmid >12 kb" ? "Purified plasmid DNA · >12 kb" : mode;

export function CustomerPricingEditor({ initial, defaultSchedule, customerName }: { initial: CustomerPricing; defaultSchedule: RateSchedule; customerName: string }) {
  const router = useRouter();
  const [pricing, setPricing] = useState(initial);
  const [values, setValues] = useState(valuesFor(initial));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Overrides | null>(null);
  const [conflict, setConflict] = useState<CustomerPricing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const changes = pending ? ACTIVE_RATE_ITEMS.filter(item => pending[item.key] !== pricing.overrides[item.key]) : [];
  const savedCount = ACTIVE_RATE_ITEMS.filter(item => pricing.overrides[item.key] !== undefined).length;

  function showError(value: string) { setError(value); requestAnimationFrame(() => alertRef.current?.focus()); }
  function change(key: RateKey, value: string) { setValues(current => ({ ...current, [key]: value })); setError(""); setMessage(""); }
  function effective(value: string, key: RateKey) {
    if (!value.trim()) return formatMoney(defaultSchedule.rates[key]);
    try { return formatMoney(dollarsToCents(value)); } catch { return "Check amount"; }
  }
  function source(value: number | undefined, key: RateKey) {
    return value === undefined ? `Use default (${formatMoney(defaultSchedule.rates[key])} today)` : `${formatMoney(value)} custom`;
  }
  function reviewChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (busy || conflict) return;
    try {
      const overrides: Overrides = {};
      for (const item of ACTIVE_RATE_ITEMS) {
        if (!values[item.key].trim()) continue;
        try { overrides[item.key] = dollarsToCents(values[item.key]); }
        catch { throw new Error(`${item.service} · ${describeType(item.mode)} · ${item.container}: enter a USD amount from 0 to 10,000 with at most two decimal places, or leave blank to use the default.`); }
      }
      if (!reason.trim()) throw new Error("Give a reason for changing this customer's prices.");
      if (ACTIVE_RATE_ITEMS.every(item => overrides[item.key] === pricing.overrides[item.key])) throw new Error("No customer prices have changed.");
      setPending(overrides); requestAnimationFrame(() => confirmationRef.current?.focus());
    } catch (error) { showError(error instanceof Error ? error.message : "Check the customer prices."); }
  }
  async function save() {
    if (!pending || saving.current || conflict) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(pricing.customerId)}/pricing`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: pricing.revision, overrides: pending, reason: reason.trim() }) });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          const latest = customerPricingSchema.safeParse(payload.pricing);
          if (latest.success) setConflict(latest.data);
          setPending(null);
        }
        throw new Error(payload.error || "Unable to save customer prices. Your edits are still here.");
      }
      const saved = customerPricingSchema.parse(payload);
      setPricing(saved); setValues(valuesFor(saved)); setPending(null); setReason(""); setConflict(null);
      setMessage("Customer prices saved. Only new orders use these prices; existing orders keep their original prices."); router.refresh();
    } catch (error) { showError(error instanceof Error ? error.message : "Unable to save customer prices. Your edits are still here."); }
    finally { saving.current = false; setBusy(false); }
  }

  return <section id="custom-pricing" aria-labelledby="custom-pricing-title" className="panel overflow-hidden">
    <div className="panel-heading"><div><p className="eyebrow">Customer agreement</p><h2 id="custom-pricing-title" className="mt-1 text-lg font-bold">Custom pricing</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Set fixed USD unit prices for {customerName}&apos;s account. Leave a price blank to follow the default rate, including future default-rate changes. Other customer accounts and historical orders are unaffected.</p></div><span className="metric-pill">{savedCount ? `${savedCount} custom rates` : "Using default prices"}</span></div>
    <form noValidate onSubmit={reviewChanges}>
      <fieldset disabled={busy || !!pending || !!conflict}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><p className="text-xs text-slate-500">USD per reaction / sample · Customer revision {pricing.revision} · Default schedule {defaultSchedule.revision}</p><button type="button" className="button-secondary" disabled={ACTIVE_RATE_ITEMS.every(item => !values[item.key].trim())} onClick={() => { setValues(Object.fromEntries(ACTIVE_RATE_ITEMS.map(item => [item.key, ""]))); setError(""); setMessage("Default prices selected. Add a reason and review before saving."); }}>Use defaults for all services</button></div>
        <div className="overflow-x-auto"><table className="data-table min-w-[760px]"><caption className="sr-only">Customer-specific sequencing rates. Blank custom prices inherit the default.</caption><thead><tr><th>Service / type</th><th>Format</th><th>Default USD</th><th>Custom USD</th><th>Customer pays</th></tr></thead><tbody>{ACTIVE_RATE_ITEMS.map(item => <tr key={item.key}>
          <td><strong>{item.service}</strong><p className="mt-1 text-xs text-slate-500">{describeType(item.mode)}</p></td><td>{item.container === "Plate" ? "96-well plate" : "Tubes / strips"}<p className="mt-1 text-xs text-slate-500">Per {item.unit}</p></td><td className="font-mono">{formatMoney(defaultSchedule.rates[item.key])}</td>
          <td><div className="flex items-center gap-2"><input className="field-input w-28" aria-label={`${item.service} ${item.mode} ${item.container} custom price USD`} value={values[item.key]} inputMode="decimal" maxLength={12} placeholder="Use default" onChange={event => change(item.key, event.target.value)} /><button type="button" className="text-xs font-semibold text-cyan-800 underline underline-offset-2 disabled:text-slate-400" disabled={!values[item.key]} aria-label={`Use default for ${item.service} ${item.mode} ${item.container}`} onClick={() => change(item.key, "")}>Clear</button></div></td>
          <td><strong className="font-mono">{effective(values[item.key], item.key)}</strong><p className="mt-1 text-xs text-slate-500">{values[item.key].trim() ? "Custom unit price" : "Follows default"}</p></td>
        </tr>)}</tbody></table></div>
        <div className="space-y-4 border-t border-slate-200 p-5"><p className="text-sm text-slate-600">Blank means use the default; <strong>0.00 means no unit charge</strong>. Taxes, shipping and additional services are excluded. Oligo synthesis remains a separate quote request.</p><label className="block"><span className="field-label">Reason for customer price change *</span><textarea className="field-input mt-2" maxLength={500} value={reason} onChange={event => { setReason(event.target.value); setError(""); setMessage(""); }} placeholder="For example: agreed sequencing prices for this customer" /></label></div>
      </fieldset>
      <div className="space-y-4 px-5 pb-5">
        {error && <div role="alert" ref={alertRef} tabIndex={-1} className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {conflict && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p>Another administrator saved customer revision {conflict.revision}. Your changes were not applied. Load the latest prices, then enter and review your changes again.</p><button type="button" className="button-secondary" onClick={() => { setPricing(conflict); setValues(valuesFor(conflict)); setPending(null); setConflict(null); setReason(""); setError(""); setMessage("Latest saved customer prices loaded. Review them before making another change."); router.refresh(); }}>Load latest customer prices</button></div>}
        {pending ? <div tabIndex={-1} ref={confirmationRef} className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-bold">Confirm {changes.length} customer price {changes.length === 1 ? "change" : "changes"}</h3><p className="mt-2 text-sm">Customer: <strong>{customerName}</strong></p><ul className="my-4 space-y-3 text-sm">{changes.map(item => <li key={item.key}><span>{item.service} · {describeType(item.mode)} · {item.container}</span><p className="mt-1"><strong>{source(pricing.overrides[item.key], item.key)} → {source(pending[item.key], item.key)}</strong> / {item.unit}</p></li>)}</ul><p className="text-sm"><strong>Reason:</strong> {reason.trim()}</p><p className="my-4 text-sm">These settings apply immediately to this customer&apos;s new orders. Saved orders keep their prices. Customers with older drafts must review any changed price before submitting. A price set to follow the default uses the default rate at order submission.</p><div className="flex flex-wrap gap-3"><button type="button" className="button-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Confirm and save customer prices"}</button><button type="button" className="button-secondary" disabled={busy} onClick={() => setPending(null)}>Back to editing</button></div></div> : !conflict && <button type="submit" className="button-primary" disabled={busy}>Review customer price changes</button>}
      </div>
    </form>
  </section>;
}
