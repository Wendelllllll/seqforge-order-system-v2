"use client";

import { useId, useState } from "react";
import { formatMoney, pricingSchema } from "@/lib/pricing";
import "./sample-table-browser.css";

export function OrderPricing({ snapshot, historical = false, presentation = "screen" }: { snapshot?: unknown; historical?: boolean; presentation?: "screen" | "print" }) {
  const parsed = pricingSchema.safeParse(snapshot);
  if (!parsed.success) return historical ? <div className="border-t border-slate-200 p-5 text-sm text-slate-500">Pricing was not recorded for this older order. No V3 rates have been applied retroactively.</div> : null;
  const price = parsed.data;
  if (price.pendingQuote && price.unit !== "base") return <div className="border-t border-amber-200 bg-amber-50 p-5"><h3 className="font-bold text-amber-950">Price pending lab confirmation</h3><p className="mt-2 text-sm text-amber-900">Your request has no confirmed price yet. The lab will confirm specifications, preparation, requested results and all charges in a quote. Work starts only after you approve that quote.</p><p className="mt-2 text-xs text-amber-900">No payment is collected on submission.</p></div>;
  const oligo = price.unit === "base" || price.unit === "oligo";
  const unitLabel = price.unit === "base" ? "bases" : price.unit === "oligo" ? "oligos" : price.unit === "sample" ? "samples" : "reactions";
  return <div className="border-t border-slate-200 bg-cyan-50/50 p-5">
    <h3 className="font-bold">{oligo ? "Oligo synthesis estimate" : "Sequencing price"} · USD</h3>
    <dl className="mt-3 space-y-3 text-sm">
      {price.lines.map((line, i) => <div key={i} className="flex flex-wrap justify-between gap-2"><dt>{line.description}{line.customPrice && <span className="ml-2 rounded bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-900">Customer price</span>}<p className="text-slate-500">{line.quantity} {line.unit ? `${line.unit}${line.quantity === 1 ? "" : "s"}` : unitLabel} × {formatMoney(line.unitCents)}</p>{!!line.targets?.length && <PriceTargets targets={line.targets} full={presentation === "print"} />}</dt><dd className="font-semibold">{formatMoney(line.amountCents)}</dd></div>)}
      {price.knownSubtotalCents !== undefined && <div className="flex justify-between gap-3 border-t border-cyan-200 pt-3 font-bold"><dt>Priced items subtotal only</dt><dd>{formatMoney(price.knownSubtotalCents)}</dd></div>}
      <div className="flex justify-between gap-3 border-t border-cyan-200 pt-3 font-bold"><dt>{oligo && price.pendingQuote ? "Final order total" : "Order subtotal"}</dt><dd>{formatMoney(price.subtotalCents)}</dd></div>
    </dl>
    {!!price.unpricedItems?.length && <p className="mt-3 text-sm text-amber-900"><strong>Separate quote required:</strong> {price.unpricedItems.join(", ")}. These oligos are not included in the standard subtotal.</p>}
    <p className="mt-3 text-xs text-slate-600">Includes the services itemized above. Taxes, shipping and requests requiring a separate quote are excluded. No payment is collected on submission.</p>
    {price.quoteApprovalRequired && <p className="mt-3 text-sm font-semibold text-amber-900">The lab will confirm your specifications and final charges. Production starts only after you approve the final quote.</p>}
    {price.reviewReasons.length ? <div className="mt-3 text-sm text-amber-900"><p className="font-semibold">Additional charges pending review</p><ul className="mt-1 list-disc pl-5">{price.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
    <p className="mt-3 text-xs text-slate-500">Rate schedule: {price.version}{historical ? " · Saved at submission" : ""}</p>
  </div>;
}

function PriceTargets({ targets, full }: { targets: string[]; full: boolean }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const listId = useId();
  if (full || targets.length <= 3) return <p className="price-targets">Applies to: {targets.join("; ")}</p>;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(targets.length / 24) - 1));
  return <div className="price-targets">
    <div className="price-targets-controls"><span>Applies to {targets.length} listed {targets.length === 1 ? "item" : "items"}</span><button type="button" className="sample-browser-button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>{open ? "Hide items" : "View items"}</button></div>
    {open && <div id={listId}><ol className="price-targets-list" start={currentPage * 24 + 1}>{targets.slice(currentPage * 24, (currentPage + 1) * 24).map((target, i) => <li key={i}>{target}</li>)}</ol>{targets.length > 24 && <div className="price-targets-controls"><span>{currentPage * 24 + 1}–{Math.min((currentPage + 1) * 24, targets.length)} of {targets.length}</span><button type="button" className="sample-browser-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous items</button><button type="button" className="sample-browser-button" disabled={(currentPage + 1) * 24 >= targets.length} onClick={() => setPage(currentPage + 1)}>Next items</button></div>}</div>}
  </div>;
}
