import { AdminPricingEditor } from "@/components/admin-pricing-editor";
import { prisma } from "@/lib/prisma";
import { getRateSchedule } from "@/lib/pricing-store";
import { formatMoney } from "@/lib/pricing";
import { RATE_ITEMS, historicalRatesSchema } from "@/lib/rate-schedule";
import { requireAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/orders";

export default async function PricingPage() {
  await requireAdmin();
  const [schedule, history] = await Promise.all([getRateSchedule(prisma), prisma.pricingChange.findMany({ orderBy: { revision: "desc" }, take: 25 })]);
  return <div className="space-y-7"><div><p className="eyebrow">Laboratory operations</p><h1 className="mt-2 text-3xl font-bold">Price management</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Set sequencing unit prices for new orders. Every submitted order keeps its original price snapshot. Taxes, shipping and additional services are excluded.</p></div>
    <AdminPricingEditor initial={schedule} />
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold">Oligo synthesis · Quote requests</h2><p className="mt-2 text-sm text-amber-900">Customers can submit synthesis requests with price pending lab confirmation. These requests do not use the sequencing rates above. Oligo price management and customer quote approval will be added after charging rules are confirmed; production is held until then.</p></div>
    <section className="panel"><div className="panel-heading"><div><h2 className="text-lg font-bold">Price change history</h2><p className="mt-1 text-sm text-slate-500">Latest 25 revisions · Who changed what, when and why</p></div></div>{history.length ? <ul className="divide-y divide-slate-200">{history.map(change => { const before = historicalRatesSchema.parse(change.previousRates); const after = historicalRatesSchema.parse(change.rates); const money = (value: number | undefined) => value === undefined ? "Not configured" : formatMoney(value); return <li className="p-5" key={change.id}><div className="flex flex-wrap justify-between gap-2"><strong>Revision {change.revision} · {change.actorName}</strong><span className="text-sm text-slate-500">{formatDateTime(change.createdAt)}</span></div><p className="my-2 text-sm">{change.reason}</p><ul className="space-y-1 text-sm text-slate-600">{RATE_ITEMS.filter(item => before[item.key] !== after[item.key]).map(item => <li key={item.key}>{item.service} · {item.mode} · {item.container}: {money(before[item.key])} → {money(after[item.key])} / {item.unit}</li>)}</ul></li>; })}</ul> : <p className="p-6 text-sm text-slate-500">No price changes yet. The initial schedule matches the existing rates.</p>}</section>
  </div>;
}
