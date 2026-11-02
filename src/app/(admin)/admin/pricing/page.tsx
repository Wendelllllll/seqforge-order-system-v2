import { AdminPricingEditor } from "@/components/admin-pricing-editor";
import { prisma } from "@/lib/prisma";
import { getRateSchedule } from "@/lib/pricing-store";
import { readPricingRecord } from "@/lib/pricing-record";
import { formatMoney } from "@/lib/pricing";
import { RATE_ITEMS, type AddOn } from "@/lib/rate-schedule";
import { requireAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/orders";

function historyDetails(previous: unknown, current: unknown) {
  try {
    const before = readPricingRecord(previous);
    const after = readPricingRecord(current);
    const money = (value: number | null | undefined) => value === undefined ? "Not configured" : value === null ? "Separate quote" : formatMoney(value);
    const changes = RATE_ITEMS.filter(item => before.rates[item.key] !== after.rates[item.key]).map(item => `${item.service} · ${item.mode} · ${item.container}: ${money(before.rates[item.key])} → ${money(after.rates[item.key])} / ${item.unit}`);
    if (before.oligo?.shortMaxBases !== after.oligo?.shortMaxBases) changes.push(`Oligo lower-tier maximum (inclusive): ${before.oligo?.shortMaxBases ?? "Not configured"} → ${after.oligo?.shortMaxBases ?? "Not configured"} bp`);
    if (before.oligo?.shortUnitCents !== after.oligo?.shortUnitCents) changes.push(`Oligo lower-tier price: ${money(before.oligo?.shortUnitCents)} → ${money(after.oligo?.shortUnitCents)} / bp`);
    if (before.oligo?.longUnitCents !== after.oligo?.longUnitCents) changes.push(`Oligo upper-tier price: ${money(before.oligo?.longUnitCents)} → ${money(after.oligo?.longUnitCents)} / bp`);
    const describe = (item: AddOn) => `${item.name} · ${item.service.replaceAll("_", " ")} · ${item.unitCents === null ? "Price not set" : formatMoney(item.unitCents)} / ${item.scope} · ${item.active ? "Enabled" : "Disabled"}${item.trigger ? ` · Linked to ${item.trigger}` : " · Customer selection"}`;
    for (const item of after.addOns ?? []) {
      const old = before.addOns?.find(value => value.id === item.id);
      if (!old) changes.push(`Added: ${describe(item)}`);
      else if (describe(old) !== describe(item)) changes.push(`${describe(old)} → ${describe(item)}`);
    }
    for (const item of before.addOns ?? []) if (!after.addOns?.some(value => value.id === item.id)) changes.push(`Removed from catalog: ${describe(item)}`);
    return changes.length ? changes : ["Catalog configuration saved; no displayed rate changed."];
  } catch {
    return ["This historical pricing record could not be displayed. Its saved data has not been changed."];
  }
}

export default async function PricingPage() {
  await requireAdmin();
  const [schedule, history] = await Promise.all([getRateSchedule(prisma), prisma.pricingChange.findMany({ orderBy: { revision: "desc" }, take: 25 })]);
  return <div className="space-y-7"><div><p className="eyebrow">Laboratory operations</p><h1 className="mt-2 text-3xl font-bold">Price management</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Manage base prices and existing additional services for Sanger, Whole Plasmid and Oligo. Changes apply to new submissions; previous orders keep their saved prices. Taxes and shipping are quoted separately.</p></div>
    <AdminPricingEditor initial={schedule} />
    <section className="panel"><div className="panel-heading"><div><h2 className="text-lg font-bold">Price change history</h2><p className="mt-1 text-sm text-slate-500">Latest 25 revisions · Who changed what, when and why</p></div></div>{history.length ? <ul className="divide-y divide-slate-200">{history.map(change => <li className="p-5" key={change.id}><div className="flex flex-wrap justify-between gap-2"><strong>Revision {change.revision} · {change.actorName}</strong><span className="text-sm text-slate-500">{formatDateTime(change.createdAt)}</span></div><p className="my-2 whitespace-pre-wrap text-sm">{change.reason}</p><ul className="space-y-1 text-sm text-slate-600">{historyDetails(change.previousRates, change.rates).map((detail, index) => <li className="break-words" key={index}>{detail}</li>)}</ul></li>)}</ul> : <p className="p-6 text-sm text-slate-500">No price changes yet. Published catalog updates will be recorded here.</p>}</section>
  </div>;
}
