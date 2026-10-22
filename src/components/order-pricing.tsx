import { formatMoney, pricingSchema } from "@/lib/pricing";

export function OrderPricing({ snapshot, historical = false }: { snapshot?: unknown; historical?: boolean }) {
  const parsed = pricingSchema.safeParse(snapshot);
  if (!parsed.success) return historical ? <div className="border-t border-slate-200 p-5 text-sm text-slate-500">Pricing was not recorded for this older order. No V3 rates have been applied retroactively.</div> : null;
  const price = parsed.data;
  if (price.pendingQuote) return <div className="border-t border-amber-200 bg-amber-50 p-5"><h3 className="font-bold text-amber-950">Price pending lab confirmation</h3><p className="mt-2 text-sm text-amber-900">Your oligo request has no confirmed price yet. The lab will confirm the requested specifications, availability, delivery, taxes and shipping in a quote. Production starts only after you approve that quote.</p><p className="mt-2 text-xs text-amber-900">No payment is collected on submission.</p></div>;
  return <div className="border-t border-slate-200 bg-cyan-50/50 p-5">
    <h3 className="font-bold">Sequencing price · USD</h3>
    <dl className="mt-3 space-y-3 text-sm">
      {price.lines.map((line, i) => <div key={i} className="flex flex-wrap justify-between gap-2"><dt>{line.description}{line.customPrice && <span className="ml-2 rounded bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-900">Customer price</span>}<p className="text-slate-500">{line.quantity} {price.unit === "sample" ? "samples" : "reactions"} × {formatMoney(line.unitCents)}</p></dt><dd className="font-semibold">{formatMoney(line.amountCents)}</dd></div>)}
      <div className="flex justify-between gap-3 border-t border-cyan-200 pt-3 font-bold"><dt>Sequencing subtotal</dt><dd>{formatMoney(price.subtotalCents)}</dd></div>
    </dl>
    <p className="mt-3 text-xs text-slate-600">Sequencing charges only. Taxes, shipping, and additional services are excluded. No payment is collected on submission.</p>
    {price.reviewReasons.length ? <div className="mt-3 text-sm text-amber-900"><p className="font-semibold">Additional charges pending review</p><ul className="mt-1 list-disc pl-5">{price.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
    <p className="mt-3 text-xs text-slate-500">Rate schedule: {price.version}{historical ? " · Saved at submission" : ""}</p>
  </div>;
}
