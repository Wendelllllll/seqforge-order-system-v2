import { formatMoney, pricingSchema } from "@/lib/pricing";

export function OrderPricing({ snapshot, historical = false }: { snapshot?: unknown; historical?: boolean }) {
  const parsed = pricingSchema.safeParse(snapshot);
  if (!parsed.success) return historical ? <div className="border-t border-slate-200 p-5 text-sm text-slate-500">Pricing was not recorded for this older order. No V3 rates have been applied retroactively.</div> : null;
  const price = parsed.data;
  return <div className="border-t border-slate-200 bg-cyan-50/50 p-5">
    <h3 className="font-bold">Sequencing price · USD</h3>
    <dl className="mt-3 space-y-3 text-sm">
      {price.lines.map((line, i) => <div key={i} className="flex flex-wrap justify-between gap-2"><dt>{line.description}<p className="text-slate-500">{line.quantity} reactions × {formatMoney(line.unitCents)}</p></dt><dd className="font-semibold">{formatMoney(line.amountCents)}</dd></div>)}
      <div className="flex justify-between gap-3 border-t border-cyan-200 pt-3 font-bold"><dt>Sequencing subtotal</dt><dd>{formatMoney(price.subtotalCents)}</dd></div>
    </dl>
    <p className="mt-3 text-xs text-slate-600">Sequencing charges only. Taxes, shipping, and additional services are excluded. No payment is collected on submission.</p>
    {price.reviewReasons.length ? <div className="mt-3 text-sm text-amber-900"><p className="font-semibold">Additional charges pending review</p><ul className="mt-1 list-disc pl-5">{price.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
    <p className="mt-3 text-xs text-slate-500">Rate schedule: {price.version}{historical ? " · Saved at submission" : ""}</p>
  </div>;
}
