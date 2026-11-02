"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { customerPricingSchema, type CustomerPricing } from "@/lib/customer-pricing";
import { formatMoney } from "@/lib/pricing";
import { ACTIVE_RATE_ITEMS, dollarsToCents, getOligoPricing, rateScheduleSchema, type AddOn, type RateSchedule } from "@/lib/rate-schedule";

type PriceMaps = {
  overrides: CustomerPricing["overrides"];
  oligoOverrides: NonNullable<CustomerPricing["oligoOverrides"]>;
  addOnOverrides: NonNullable<CustomerPricing["addOnOverrides"]>;
};
const oligoKeys = ["shortUnitCents", "longUnitCents"] as const;
type OligoKey = typeof oligoKeys[number];
type PriceFields = { rates: Record<string, string>; oligo: Record<OligoKey, string>; addOns: Record<string, string> };
type PriceChange = { key: string; label: string; before: string; after: string; unit: string };
type Conflict = { pricing: CustomerPricing; schedule?: RateSchedule };
const serviceNames = { SANGER: "Sanger", WHOLE_PLASMID: "Whole Plasmid", OLIGO: "Oligo" };
const serviceTabs: AddOn["service"][] = ["SANGER", "WHOLE_PLASMID", "OLIGO"];
const moneyInput = (value: number | undefined) => value === undefined ? "" : (value / 100).toFixed(2);
const mapsFor = (pricing: CustomerPricing): PriceMaps => ({ overrides: pricing.overrides, oligoOverrides: pricing.oligoOverrides ?? {}, addOnOverrides: pricing.addOnOverrides ?? {} });
const valuesFor = (pricing: CustomerPricing): PriceFields => ({
  rates: Object.fromEntries(ACTIVE_RATE_ITEMS.map(item => [item.key, moneyInput(pricing.overrides[item.key])])),
  oligo: { shortUnitCents: moneyInput(pricing.oligoOverrides?.shortUnitCents), longUnitCents: moneyInput(pricing.oligoOverrides?.longUnitCents) },
  addOns: Object.fromEntries(Object.entries(pricing.addOnOverrides ?? {}).map(([id, value]) => [id, moneyInput(value)])),
});
const describeType = (mode: string) => mode === "Whole plasmid" ? "Purified plasmid DNA · ≤12 kb" : mode === "Whole plasmid >12 kb" ? "Purified plasmid DNA · >12 kb" : mode;
const defaultPrice = (value: number | null) => value === null ? "Not priced" : formatMoney(value);
const describePrice = (value: number | undefined, base: number | null) => value === undefined ? `Use default (${defaultPrice(base)} today)` : `${formatMoney(value)} custom`;
function changesFor(before: PriceMaps, after: PriceMaps, schedule: RateSchedule): PriceChange[] {
  const changes: PriceChange[] = ACTIVE_RATE_ITEMS.filter(item => before.overrides[item.key] !== after.overrides[item.key]).map(item => ({ key: item.key, label: `${item.service} · ${describeType(item.mode)} · ${item.container}`, before: describePrice(before.overrides[item.key], schedule.rates[item.key]), after: describePrice(after.overrides[item.key], schedule.rates[item.key]), unit: item.unit }));
  const oligo = getOligoPricing(schedule);
  for (const key of oligoKeys) if (before.oligoOverrides[key] !== after.oligoOverrides[key]) changes.push({ key: `oligo-${key}`, label: `Oligo · ${key === "shortUnitCents" ? `Up to ${oligo.shortMaxBases} bp (inclusive)` : `Above ${oligo.shortMaxBases} bp`}${oligo[key] === null ? " · Quote required" : ""}`, before: describePrice(before.oligoOverrides[key], oligo[key]), after: describePrice(after.oligoOverrides[key], oligo[key]), unit: "bp" });
  for (const id of new Set([...Object.keys(before.addOnOverrides), ...Object.keys(after.addOnOverrides)])) {
    if (before.addOnOverrides[id] === after.addOnOverrides[id]) continue;
    const item = schedule.addOns?.find(value => value.id === id);
    const available = item?.active && item.unitCents !== null;
    changes.push({ key: `addon-${id}`, label: item ? `${serviceNames[item.service]} · ${item.name}${available ? "" : " · Unavailable"}` : `Unavailable additional service · ${id}`, before: describePrice(before.addOnOverrides[id], item?.unitCents ?? null), after: describePrice(after.addOnOverrides[id], item?.unitCents ?? null), unit: item?.scope ?? "service" });
  }
  return changes;
}

export function CustomerPricingEditor({ initial, defaultSchedule, customerName }: { initial: CustomerPricing; defaultSchedule: RateSchedule; customerName: string }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(defaultSchedule);
  const oligoRates = getOligoPricing(schedule);
  const [pricing, setPricing] = useState(initial);
  const [values, setValues] = useState(valuesFor(initial));
  const [activeService, setActiveService] = useState<AddOn["service"]>("SANGER");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<PriceMaps | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const changes = pending ? changesFor(mapsFor(pricing), pending, schedule) : [];
  const savedCount = ACTIVE_RATE_ITEMS.filter(item => pricing.overrides[item.key] !== undefined).length + Object.keys(pricing.oligoOverrides ?? {}).length + Object.keys(pricing.addOnOverrides ?? {}).length;
  const hasCustomValues = Object.values(values).some(group => Object.values(group).some(value => value.trim()));
  const unavailableIds = Object.keys(values.addOns).filter(id => !schedule.addOns?.some(item => item.id === id) && (values.addOns[id].trim() || pricing.addOnOverrides?.[id] !== undefined));
  const locked = busy || !!pending || !!conflict;

  function showError(value: string) { setError(value); requestAnimationFrame(() => alertRef.current?.focus()); }
  function change(group: keyof PriceFields, key: string, value: string) { setValues(current => ({ ...current, [group]: { ...current[group], [key]: value } })); setError(""); setMessage(""); }
  function effective(value: string, base: number | null) {
    if (!value.trim()) return defaultPrice(base);
    try { return formatMoney(dollarsToCents(value)); } catch { return "Check amount"; }
  }
  function priceInput(group: keyof PriceFields, key: string, label: string, unavailable = false) {
    const value = (values[group] as Record<string, string>)[key] ?? "";
    return <div className="flex items-center gap-2"><input className="field-input w-28" aria-label={`${label} custom price USD`} value={value} inputMode="decimal" maxLength={12} placeholder="Use default" disabled={unavailable} onChange={event => change(group, key, event.target.value)} /><button type="button" className="text-xs font-semibold text-cyan-800 underline underline-offset-2 disabled:text-slate-400" disabled={!value} aria-label={`Use default for ${label}`} onClick={() => change(group, key, "")}>Clear</button></div>;
  }
  function load(value: CustomerPricing, nextSchedule?: RateSchedule) {
    setPricing(value); setValues(valuesFor(value)); if (nextSchedule) setSchedule(nextSchedule);
    setPending(null); setConflict(null); setReason("");
  }
  function reviewChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (locked) return;
    try {
      const next: PriceMaps = { overrides: {}, oligoOverrides: {}, addOnOverrides: {} };
      function parse(value: string, label: string) {
        try { return dollarsToCents(value); }
        catch { throw new Error(`${label}: enter a USD amount from 0 to 10,000 with at most two decimal places, or leave blank to use the default.`); }
      }
      for (const item of ACTIVE_RATE_ITEMS) if (values.rates[item.key].trim()) next.overrides[item.key] = parse(values.rates[item.key], `${item.service} · ${describeType(item.mode)} · ${item.container}`);
      for (const key of oligoKeys) if (values.oligo[key].trim()) next.oligoOverrides[key] = parse(values.oligo[key], `Oligo ${key === "shortUnitCents" ? "lower" : "upper"} tier`);
      for (const [id, value] of Object.entries(values.addOns)) if (value.trim()) next.addOnOverrides[id] = parse(value, schedule.addOns?.find(item => item.id === id)?.name ?? `Additional service ${id}`);
      if (!reason.trim()) throw new Error("Give a reason for changing this customer's prices.");
      if (!changesFor(mapsFor(pricing), next, schedule).length) throw new Error("No customer prices have changed.");
      setPending(next); requestAnimationFrame(() => confirmationRef.current?.focus());
    } catch (error) { showError(error instanceof Error ? error.message : "Check the customer prices."); }
  }
  async function save() {
    if (!pending || saving.current || conflict) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(pricing.customerId)}/pricing`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: pricing.revision, globalRevision: schedule.revision, ...pending, reason: reason.trim() }) });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          const latest = customerPricingSchema.safeParse(payload.pricing);
          const latestSchedule = rateScheduleSchema.safeParse(payload.schedule);
          if (latest.success) setConflict({ pricing: latest.data, ...(latestSchedule.success ? { schedule: latestSchedule.data } : {}) });
          setPending(null);
        }
        throw new Error(payload.error || "Unable to save customer prices. Your edits are still here.");
      }
      load(customerPricingSchema.parse(payload));
      setMessage("Customer prices saved. Only new orders use these prices; existing orders keep their original prices."); router.refresh();
    } catch (error) { showError(error instanceof Error ? error.message : "Unable to save customer prices. Your edits are still here."); }
    finally { saving.current = false; setBusy(false); }
  }

  return <section id="custom-pricing" aria-labelledby="custom-pricing-title" className="panel overflow-hidden">
    <div className="panel-heading"><div><p className="eyebrow">Customer agreement</p><h2 id="custom-pricing-title" className="mt-1 text-lg font-bold">Custom pricing</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Set fixed USD unit prices for {customerName}&apos;s account. Leave a price blank to follow the default rate, including future default-rate changes. Other customer accounts and historical orders are unaffected.</p></div><span className="metric-pill">{savedCount ? `${savedCount} custom rates` : "Using default prices"}</span></div>
    <form noValidate onSubmit={reviewChanges}>
      <div className="space-y-4 border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">USD unit prices · Customer revision {pricing.revision} · Default schedule {schedule.revision}</p><button type="button" className="button-secondary" disabled={locked || !hasCustomValues} onClick={() => { setValues({ rates: Object.fromEntries(ACTIVE_RATE_ITEMS.map(item => [item.key, ""])), oligo: { shortUnitCents: "", longUnitCents: "" }, addOns: Object.fromEntries(Object.keys(values.addOns).map(id => [id, ""])) }); setError(""); setMessage("Default prices selected for all services. Add a reason and review before saving."); }}>Use defaults for all services</button></div>
        <div role="tablist" aria-label="Customer service pricing" className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">{serviceTabs.map((service, index) => <button key={service} ref={element => { tabRefs.current[index] = element; }} id={`customer-pricing-tab-${service}`} type="button" role="tab" aria-selected={activeService === service} aria-controls={`customer-pricing-panel-${service}`} tabIndex={activeService === service ? 0 : -1} className={`rounded-lg px-2 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 sm:px-4 ${activeService === service ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:bg-white/60 hover:text-slate-900"}`} onClick={() => setActiveService(service)} onKeyDown={event => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % serviceTabs.length;
          else if (event.key === "ArrowLeft") next = (index + serviceTabs.length - 1) % serviceTabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = serviceTabs.length - 1;
          else return;
          event.preventDefault(); setActiveService(serviceTabs[next]); tabRefs.current[next]?.focus();
        }}>{serviceNames[service]}</button>)}</div>
      </div>
      <fieldset disabled={locked}>
        {serviceTabs.map(service => {
          const rates = ACTIVE_RATE_ITEMS.filter(item => item.service === serviceNames[service]);
          const addOns = (schedule.addOns ?? []).filter(item => item.service === service);
          return <div key={service} id={`customer-pricing-panel-${service}`} role="tabpanel" aria-labelledby={`customer-pricing-tab-${service}`} tabIndex={0} hidden={activeService !== service}>
            <div className="px-5 pt-5"><h3 className="font-bold">{serviceNames[service]} base prices</h3>{service === "OLIGO" && <p className="mt-2 text-sm text-slate-500">Standard DNA · 25 nmol · Desalted · No modifications. The default length boundary remains {oligoRates.shortMaxBases} bp; only this customer&apos;s per-base prices change.</p>}</div>
            <div className="overflow-x-auto"><table className="data-table min-w-[700px]"><caption className="sr-only">{serviceNames[service]} customer base rates. Blank custom prices inherit the default.</caption><thead><tr><th>{service === "OLIGO" ? "Length tier" : "Submission type / format"}</th><th>Charge per</th><th>Default USD</th><th>Custom USD</th><th>Customer pays</th></tr></thead><tbody>
              {service === "OLIGO" ? oligoKeys.map(key => {
                const available = oligoRates[key] !== null;
                const label = `Oligo ${key === "shortUnitCents" ? "lower" : "upper"} tier`;
                return <tr key={key}><td><strong>{key === "shortUnitCents" ? `Up to ${oligoRates.shortMaxBases} bp` : `Above ${oligoRates.shortMaxBases} bp`}</strong><p className="mt-1 text-xs text-slate-500">{key === "shortUnitCents" ? "Includes the boundary length" : "One rate for the entire sequence"}</p></td><td>bp</td><td className="font-mono">{available ? formatMoney(oligoRates[key]!) : "Quote required"}</td><td>{priceInput("oligo", key, label, !available)}</td><td><strong className="font-mono">{available ? effective(values.oligo[key], oligoRates[key]) : "Quote required"}</strong><p className="mt-1 text-xs text-slate-500">{!available ? "Stored custom price is not applied" : values.oligo[key].trim() ? "Custom unit price" : "Follows default"}</p></td></tr>;
              }) : rates.map(item => <tr key={item.key}><td><strong>{describeType(item.mode)}</strong><p className="mt-1 text-xs text-slate-500">{item.container === "Plate" ? "96-well plate" : "Tubes / strips"}</p></td><td>{item.unit}</td><td className="font-mono">{formatMoney(schedule.rates[item.key])}</td><td>{priceInput("rates", item.key, `${item.service} ${item.mode} ${item.container}`)}</td><td><strong className="font-mono">{effective(values.rates[item.key], schedule.rates[item.key])}</strong><p className="mt-1 text-xs text-slate-500">{values.rates[item.key].trim() ? "Custom unit price" : "Follows default"}</p></td></tr>)}
            </tbody></table></div>
            {service === "OLIGO" && <p className="px-5 pb-4 text-xs text-slate-500">Other scales, purification and modifications still require a separate quote. Production remains subject to quote approval.</p>}
            <div className="border-t border-slate-200 px-5 pt-5"><h3 className="font-bold">{serviceNames[service]} additional services</h3><p className="mt-2 text-sm text-slate-500">Customer prices use the existing service definitions. A custom price cannot enable a disabled or unpriced service.</p></div>
            {addOns.length ? <div className="overflow-x-auto"><table className="data-table min-w-[700px]"><caption className="sr-only">{serviceNames[service]} additional service prices and availability.</caption><thead><tr><th>Additional service</th><th>Charge per</th><th>Default USD</th><th>Custom USD</th><th>Customer pays</th></tr></thead><tbody>{addOns.map(item => {
              const available = item.active && item.unitCents !== null;
              const value = values.addOns[item.id] ?? "";
              return <tr key={item.id}><td><strong>{item.name}</strong><p className="mt-1 text-xs text-slate-500">{!item.active ? "Disabled in the default catalog" : item.unitCents === null ? "Default price not set" : item.trigger ? `Linked to ${item.trigger}` : "Customer selection"}</p></td><td>{item.scope}</td><td className="font-mono">{defaultPrice(item.unitCents)}</td><td>{priceInput("addOns", item.id, `${serviceNames[service]} ${item.name}`, !available)}</td><td><strong className="font-mono">{available ? effective(value, item.unitCents) : "Not available"}</strong><p className="mt-1 text-xs text-slate-500">{!available ? value.trim() ? "Stored custom price is not applied" : "Not selectable at checkout" : value.trim() ? "Custom unit price" : "Follows default"}</p></td></tr>;
            })}</tbody></table></div> : <p className="p-5 text-sm text-slate-500">No additional services are configured for {serviceNames[service]}.</p>}
            {service === "SANGER" && addOns.some(item => item.scope === "sample") && <p className="px-5 pb-4 text-xs text-slate-500">A per-sample service is charged once even when that sample has several sequencing reactions.</p>}
          </div>;
        })}
        {unavailableIds.length > 0 && <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-5"><h3 className="font-semibold">Overrides for unavailable services</h3><p className="text-sm text-slate-500">These saved services are no longer in the default catalog. Their prices are not charged; clear an override to remove it.</p>{unavailableIds.map(id => <div key={id} className="flex flex-wrap items-center justify-between gap-3"><span className="break-all text-sm">Service ID: {id}</span>{priceInput("addOns", id, `Unavailable service ${id}`, true)}</div>)}</div>}
        <div className="space-y-4 border-t border-slate-200 p-5"><p className="text-sm text-slate-600">Blank means use the default; <strong>0.00 means no unit charge</strong>. Taxes and shipping are excluded. Switching tabs keeps your edits; changes for all services are reviewed together.</p><label className="block"><span className="field-label">Reason for customer price change *</span><textarea className="field-input mt-2" maxLength={500} value={reason} onChange={event => { setReason(event.target.value); setError(""); setMessage(""); }} placeholder="For example: agreed base prices and service fees for this customer" /></label></div>
      </fieldset>
      <div className="space-y-4 px-5 pb-5">
        {error && <div role="alert" ref={alertRef} tabIndex={-1} className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {conflict && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p>{conflict.schedule ? `The default catalog changed to revision ${conflict.schedule.revision}.` : `Another administrator saved customer revision ${conflict.pricing.revision}.`} Your changes were not applied. Load the latest prices, then enter and review your changes again.</p><button type="button" className="button-secondary" onClick={() => { load(conflict.pricing, conflict.schedule); setError(""); setMessage("Latest saved prices loaded. Review them before making another change."); router.refresh(); }}>Load latest prices</button></div>}
        {pending ? <div tabIndex={-1} ref={confirmationRef} className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-bold">Confirm {changes.length} customer price {changes.length === 1 ? "change" : "changes"}</h3><p className="mt-2 text-sm">Customer: <strong>{customerName}</strong></p><ul className="my-4 space-y-3 text-sm">{changes.map(item => <li key={item.key}><span>{item.label}</span><p className="mt-1"><strong>{item.before} → {item.after}</strong> / {item.unit}</p></li>)}</ul><p className="text-sm"><strong>Reason:</strong> {reason.trim()}</p><p className="my-4 text-sm">These settings apply immediately to this customer&apos;s new orders. Saved orders keep their prices. Customers with older drafts must review any changed price before submitting. Default prices and service availability are checked at order submission.</p><div className="flex flex-wrap gap-3"><button type="button" className="button-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Confirm and save customer prices"}</button><button type="button" className="button-secondary" disabled={busy} onClick={() => setPending(null)}>Back to editing</button></div></div> : !conflict && <button type="submit" className="button-primary" disabled={busy}>Review customer price changes</button>}
      </div>
    </form>
  </section>;
}
