"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/pricing";
import { ACTIVE_RATE_ITEMS, DEFAULT_ADD_ONS, DEFAULT_OLIGO_PRICING, dollarsToCents, getOligoPricing, priceUpdateSchema, RATE_ITEMS, rateScheduleSchema, type AddOn, type OligoPricing, type RateSchedule } from "@/lib/rate-schedule";

type Catalog = { rates: RateSchedule["rates"]; oligo: OligoPricing; addOns: AddOn[] };
type AddOnFields = Omit<AddOn, "unitCents"> & { amount: string };
type Change = { key: string; label: string; before: string; after: string };
const serviceNames = { SANGER: "Sanger", WHOLE_PLASMID: "Whole Plasmid", OLIGO: "Oligo" };
const serviceTabs: AddOn["service"][] = ["SANGER", "WHOLE_PLASMID", "OLIGO"];
const moneyInput = (value: number | null) => value === null ? "" : (value / 100).toFixed(2);
const valuesFor = (value: RateSchedule) => Object.fromEntries(RATE_ITEMS.map(item => [item.key, moneyInput(value.rates[item.key])]));
const addOnsFor = (value: RateSchedule): AddOnFields[] => (value.addOns ?? DEFAULT_ADD_ONS).map(({ unitCents, ...item }) => ({ ...item, amount: moneyInput(unitCents) }));
const describeAddOn = (item: AddOn) => `${serviceNames[item.service]} · ${item.unitCents === null ? "Price not set" : formatMoney(item.unitCents)} / ${item.scope} · ${item.active ? "Enabled" : "Disabled"}${item.trigger ? ` · Linked to ${item.trigger}` : " · Customer selection"}`;

function changesFor(before: RateSchedule, after: Catalog): Change[] {
  const changes: Change[] = ACTIVE_RATE_ITEMS.filter(item => before.rates[item.key] !== after.rates[item.key]).map(item => ({ key: item.key, label: `${item.service} · ${item.mode} · ${item.container}`, before: `${formatMoney(before.rates[item.key])} / ${item.unit}`, after: `${formatMoney(after.rates[item.key])} / ${item.unit}` }));
  const oldOligo = getOligoPricing(before);
  if (oldOligo.shortMaxBases !== after.oligo.shortMaxBases) changes.push({ key: "oligo-length", label: "Oligo lower-tier maximum length", before: `${oldOligo.shortMaxBases} bp (inclusive)`, after: `${after.oligo.shortMaxBases} bp (inclusive)` });
  if (oldOligo.shortUnitCents !== after.oligo.shortUnitCents) changes.push({ key: "oligo-short", label: "Oligo lower-tier price", before: `${formatMoney(oldOligo.shortUnitCents)} / bp`, after: `${formatMoney(after.oligo.shortUnitCents)} / bp` });
  if (oldOligo.longUnitCents !== after.oligo.longUnitCents) changes.push({ key: "oligo-long", label: "Oligo upper-tier price", before: oldOligo.longUnitCents === null ? "Separate quote" : `${formatMoney(oldOligo.longUnitCents)} / bp`, after: after.oligo.longUnitCents === null ? "Separate quote" : `${formatMoney(after.oligo.longUnitCents)} / bp` });
  const oldAddOns = before.addOns ?? DEFAULT_ADD_ONS;
  for (const item of after.addOns) {
    const old = oldAddOns.find(value => value.id === item.id);
    if (!old || old.name !== item.name || describeAddOn(old) !== describeAddOn(item)) changes.push({ key: item.id, label: old && old.name !== item.name ? `${old.name} → ${item.name}` : item.name, before: old ? describeAddOn(old) : "New additional service", after: describeAddOn(item) });
  }
  return changes;
}

export function AdminPricingEditor({ initial }: { initial: RateSchedule }) {
  const router = useRouter();
  const [activeService, setActiveService] = useState<AddOn["service"]>("SANGER");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [schedule, setSchedule] = useState(initial);
  const [values, setValues] = useState(valuesFor(initial));
  const [oligoLength, setOligoLength] = useState(String(getOligoPricing(initial).shortMaxBases));
  const [oligoShort, setOligoShort] = useState(moneyInput(getOligoPricing(initial).shortUnitCents));
  const [oligoLong, setOligoLong] = useState(moneyInput(getOligoPricing(initial).longUnitCents ?? DEFAULT_OLIGO_PRICING.longUnitCents));
  const [addOns, setAddOns] = useState<AddOnFields[]>(addOnsFor(initial));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = busy || !!pending;
  const changes = pending ? changesFor(schedule, pending) : [];

  function load(value: RateSchedule) {
    setSchedule(value); setValues(valuesFor(value));
    const oligo = getOligoPricing(value);
    setOligoLength(String(oligo.shortMaxBases)); setOligoShort(moneyInput(oligo.shortUnitCents)); setOligoLong(moneyInput(oligo.longUnitCents ?? DEFAULT_OLIGO_PRICING.longUnitCents));
    setAddOns(addOnsFor(value)); setPending(null);
  }
  function editAddOn(id: string, patch: Partial<Pick<AddOnFields, "amount" | "active">>) {
    setAddOns(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
    setError(""); setMessage("");
  }
  function review() {
    setError(""); setMessage("");
    try {
      if (!reason.trim()) throw new Error("Add a reason for this catalog change.");
      if (!/^\d+$/.test(oligoLength.trim())) throw new Error("Enter a whole-number Oligo length boundary.");
      for (const item of addOns) {
        if (item.active && !item.amount.trim()) throw new Error(`Set a price before enabling ${item.name}.`);
      }
      const next = {
        rates: Object.fromEntries(RATE_ITEMS.map(item => [item.key, dollarsToCents(values[item.key])])) as RateSchedule["rates"],
        oligo: { shortMaxBases: Number(oligoLength), shortUnitCents: dollarsToCents(oligoShort), longUnitCents: dollarsToCents(oligoLong) },
        addOns: addOns.map(({ amount, ...item }) => ({ ...item, unitCents: amount.trim() ? dollarsToCents(amount) : null })),
      };
      const parsed = priceUpdateSchema.safeParse({ ...next, revision: schedule.revision, reason });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Check the pricing rules and add a reason for this change.");
      if (!changesFor(schedule, next).length) throw new Error("No prices or services have changed.");
      setPending(next);
    } catch (error) { setError(error instanceof Error ? error.message : "Check the pricing fields."); }
  }
  async function save() {
    if (!pending || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: schedule.revision, ...pending, reason }) });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409 && payload.schedule) {
          load(rateScheduleSchema.parse(payload.schedule));
          throw new Error("Another administrator changed the catalog. The latest prices have been loaded. Your proposed changes were not saved; review the current values and re-enter your changes.");
        }
        throw new Error(payload.error || "Unable to save prices.");
      }
      load(rateScheduleSchema.parse(payload)); setReason("");
      setMessage("Prices saved. New submissions use this catalog. Existing order prices are unchanged."); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save prices."); }
    finally { setBusy(false); }
  }

  return <form className="space-y-6" onSubmit={event => { event.preventDefault(); if (!locked) review(); }}>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500"><p>Choose a service to manage its prices.</p><span className="metric-pill">USD · Revision {schedule.revision}</span></div>
      <div role="tablist" aria-label="Service pricing" className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
        {serviceTabs.map((service, index) => <button key={service} ref={element => { tabRefs.current[index] = element; }} id={`pricing-tab-${service}`} type="button" role="tab" aria-selected={activeService === service} aria-controls={`pricing-panel-${service}`} tabIndex={activeService === service ? 0 : -1} className={`rounded-lg px-2 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 sm:px-4 ${activeService === service ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:bg-white/60 hover:text-slate-900"}`} onClick={() => setActiveService(service)} onKeyDown={event => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % serviceTabs.length;
          else if (event.key === "ArrowLeft") next = (index + serviceTabs.length - 1) % serviceTabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = serviceTabs.length - 1;
          else return;
          event.preventDefault(); setActiveService(serviceTabs[next]); tabRefs.current[next]?.focus();
        }}>{serviceNames[service]}</button>)}
      </div>
    </div>

    {serviceTabs.map(service => {
      const serviceRates = ACTIVE_RATE_ITEMS.filter(item => item.service === serviceNames[service]);
      const serviceAddOns = addOns.filter(item => item.service === service);
      return <div key={service} id={`pricing-panel-${service}`} role="tabpanel" aria-labelledby={`pricing-tab-${service}`} tabIndex={0} hidden={activeService !== service} className="space-y-6">
        <section className="panel overflow-hidden">
          <div className="panel-heading"><div><h2 className="text-lg font-bold">{serviceNames[service]} base prices</h2><p className="mt-1 text-sm text-slate-500">{service === "OLIGO" ? "Standard DNA · 25 nmol · Desalted · No modifications" : "Customer-specific sequencing prices still take precedence."}</p></div><span className="metric-pill">{service === "OLIGO" ? "USD / bp" : `${serviceRates.length} rates`}</span></div>
          {service === "OLIGO" ? <fieldset disabled={locked} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <label><span className="field-label">Lower-tier maximum length (bp)</span><input className="field-input mt-2" inputMode="numeric" value={oligoLength} onChange={event => { setOligoLength(event.target.value); setMessage(""); }} /><span className="mt-1 block text-xs text-slate-500">Includes this exact length.</span></label>
              <label><span className="field-label">Lower-tier price (USD / bp)</span><input className="field-input mt-2" inputMode="decimal" value={oligoShort} onChange={event => { setOligoShort(event.target.value); setMessage(""); }} /></label>
              <label><span className="field-label">Upper-tier price (USD / bp)</span><input className="field-input mt-2" inputMode="decimal" value={oligoLong} onChange={event => { setOligoLong(event.target.value); setMessage(""); }} /><span className="mt-1 block text-xs text-slate-500">Applies above the length boundary.</span></label>
            </div>
            {getOligoPricing(schedule).longUnitCents === null && <p className="text-sm text-amber-900">The upper tier currently requires a quote. The proposed rate takes effect only after you review and publish it.</p>}
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Each oligo uses one rate for its entire sequence. Other scales, purification and modifications still require a separate quote. Production remains subject to quote approval.</p>
          </fieldset> : <div className="overflow-x-auto"><table className="data-table min-w-[560px]"><thead><tr><th>Submission type</th><th>Format</th><th>Charge per</th><th>Current USD</th><th>New USD</th></tr></thead><tbody>{serviceRates.map(item => <tr key={item.key}><td className="font-semibold">{item.mode === "Whole plasmid" ? "Purified plasmid DNA · ≤12 kb" : item.mode}</td><td>{item.container === "Plate" ? "96-well plate" : "Tubes / strips"}</td><td>{item.unit}</td><td className="font-mono">{formatMoney(schedule.rates[item.key])}</td><td><input className="field-input w-28" aria-label={`${item.service} ${item.mode} ${item.container} price USD`} inputMode="decimal" value={values[item.key]} disabled={locked} onChange={event => { setValues({ ...values, [item.key]: event.target.value }); setMessage(""); }} /></td></tr>)}</tbody></table></div>}
        </section>

        <section className="panel overflow-hidden">
          <div className="panel-heading"><div><h2 className="text-lg font-bold">{serviceNames[service]} additional services</h2><p className="mt-1 text-sm text-slate-500">Set a price and enable an existing service to offer it at checkout.</p></div><span className="metric-pill">{serviceAddOns.length} configured</span></div>
          <fieldset disabled={locked} className="divide-y divide-slate-200">
            {serviceAddOns.map(item => <div key={item.id} className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
              <div><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-sm text-slate-500">Charged per {item.scope} · {item.trigger ? `Linked to ${item.trigger}` : "Selected by the customer"}</p>{item.trigger && <p className="mt-1 text-xs text-slate-500">When enabled, selecting this service and its linked request does not charge twice.</p>}{item.scope === "sample" && <p className="mt-1 text-xs text-slate-500">Charged once per sample, even with multiple sequencing reactions.</p>}</div>
              <div className="space-y-3"><label className="block"><span className="field-label">Price (USD / {item.scope})</span><input className="field-input mt-2" inputMode="decimal" placeholder="Not set" value={item.amount} aria-label={`${serviceNames[service]} ${item.name} price USD`} onChange={event => editAddOn(item.id, { amount: event.target.value })} /><span className="mt-1 block text-xs text-slate-500">Blank is unpriced; 0.00 is free.</span></label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" aria-label={`Enable ${serviceNames[service]} ${item.name}`} checked={item.active} onChange={event => editAddOn(item.id, { active: event.target.checked })} />Enabled for new orders</label></div>
            </div>)}
            {!serviceAddOns.length && <p className="p-5 text-sm text-slate-500">No additional services are configured for {serviceNames[service]}.</p>}
          </fieldset>
          <p className="border-t border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">Service names and charging rules are fixed. Prices and availability can be updated here; previous orders keep their saved details.</p>
        </section>
      </div>;
    })}

    <section className="panel space-y-4 p-5">
      <p className="text-sm text-slate-600">Changes across all three services are reviewed and published together. Switching tabs keeps your edits.</p>
      <label className="block"><span className="field-label">Reason for change *</span><textarea className="field-input mt-2" maxLength={500} value={reason} disabled={locked} onChange={event => setReason(event.target.value)} placeholder="For example: introduce PCR cleanup charges and update Oligo length tiers" /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {pending ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-bold">Review {changes.length} catalog {changes.length === 1 ? "change" : "changes"}</h3><ul className="my-4 space-y-3 text-sm">{changes.map(change => <li key={change.key}><strong>{change.label}</strong><p className="mt-1 text-slate-600">{change.before} → <span className="font-semibold text-slate-900">{change.after}</span></p></li>)}</ul><p className="mb-4 text-sm">Changes apply to new submissions. Existing orders keep their saved prices. Customers with older drafts must review the latest price before submitting.</p><div className="flex flex-wrap gap-3"><button className="button-primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Confirm and publish prices"}</button><button className="button-secondary" type="button" disabled={busy} onClick={() => setPending(null)}>Back to editing</button></div></div> : <button className="button-primary" type="submit">Review price changes</button>}
    </section>
  </form>;
}
