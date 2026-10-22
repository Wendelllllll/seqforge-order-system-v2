import { z } from "zod";
import { orderDefaultsSchema } from "@/lib/order-defaults";
import { OrderPricing } from "@/components/order-pricing";
import type { ReactionDraft } from "@/lib/order-intake";
import { readOligoSnapshot, type OligoDraft } from "@/lib/oligo-schema";

type ManifestSample = {
  sampleKey: string; sampleName: string; tubeLabel: string; plateLabel: string; well: string;
  templateType: string; templateLength: string; concentration: string | null;
  preparation: string; notes: string | null;
  reactions: { [K in keyof ReactionDraft]: string }[];
};
export type ManifestOrder = {
  service?: string;
  orderName: string; orderNumber?: string; poNumber: string | null; specialInstructions: string | null;
  priority: string; container: string; submissionMode: string; intakeVersion?: number;
  samples: ManifestSample[]; pricingSnapshot?: unknown; fulfillmentSnapshot?: unknown;
  oligoSnapshot?: unknown; oligos?: OligoDraft[]; oligoShippingAddress?: string; oligoFormat?: string;
};

export function OrderManifest({ order }: { order: ManifestOrder }) {
  if (order.service === "OLIGO") return <OligoManifest order={order} />;
  const plasmid = order.service === "WHOLE_PLASMID";
  const readyToLoad = order.submissionMode === "Ready to load";
  const primerName = (name: string) => readyToLoad && name === "Included in mix" ? "Not specified (optional)" : name;
  const primerSource = (source: string) => readyToLoad && source === "Included in mix" ? "Completed sequencing reaction" : source;
  const parsedDetails = orderDefaultsSchema.safeParse(order.fulfillmentSnapshot);
  const sharing = z.object({ sharedResultEmails: z.array(z.string().email()).optional() }).safeParse(order.fulfillmentSnapshot);
  const recipients = sharing.success ? sharing.data.sharedResultEmails || [] : [];
  const details = parsedDetails.success ? parsedDetails.data : null;
  const reactions = order.samples.flatMap((sample) => sample.reactions.map((reaction, index) => ({ sample, reaction, index })));
  return <section className="panel submission-manifest">
    <div className="panel-heading">
      <div><p className="eyebrow">Submission manifest</p><h2 className="mt-1 text-lg font-bold">{order.orderName || "Untitled order"}</h2>{order.orderNumber ? <p className="mt-1 font-mono text-sm">{order.orderNumber}</p> : null}</div>
      <span className="metric-pill">{order.samples.length} physical {order.samples.length === 1 ? "sample" : "samples"}{!plasmid && <> · {reactions.length} {reactions.length === 1 ? "reaction" : "reactions"}</>}</span>
    </div>
    <div className="space-y-3 border-b border-slate-200 p-5 text-sm">
      {plasmid && <p><strong>Service:</strong> Whole Plasmid Sequencing · Purified plasmid DNA</p>}
      {order.intakeVersion === 1 ? <p>Legacy demo order: service and container choices were not recorded. Each original entry is preserved as one sample and one reaction.</p> : <p><strong>Priority:</strong> {order.priority} · <strong>Mode:</strong> {order.submissionMode} · <strong>Container:</strong> {order.container}</p>}
      {recipients.length > 0 && <p><strong>Share results with:</strong> {recipients.join(", ")} · Recorded for lab follow-up; no automatic email or account access.</p>}
      <p><strong>PO / reference:</strong> {order.poNumber || "Not provided"}</p>
      {details ? <div className="grid gap-3 sm:grid-cols-2">
        <div><p><strong>Delivery:</strong> {details.deliveryMethod}</p>
          {details.deliveryMethod === "Pickup" ? <><p className="whitespace-pre-wrap"><strong>Pickup:</strong> {details.pickupLocation}</p><p className="whitespace-pre-wrap">{details.pickupInstructions}</p></> : null}
          <p><strong>Contact:</strong> {details.contactName} · {details.contactPhone}</p>
        </div>
        <div><p><strong>PI:</strong> {details.piName || "Not provided"}</p><p><strong>Bill to:</strong> {details.billingOrganization}</p>
          <p>{details.billingContactName} · {details.billingEmail}</p><p className="whitespace-pre-wrap">{details.billingAddress}</p>
          <p><strong>Payment method:</strong> {details.paymentMethod} · No payment collected</p>
        </div>
      </div> : order.orderNumber ? <p>Pickup and billing details were not recorded for this historical order.</p> : null}
      <p className="text-slate-500">{!plasmid && "Service, preparation, stored primers, and synthesis requests require lab confirmation. "}Turnaround, delivery and sample acceptance require lab confirmation.</p>
    </div>
    <div className="overflow-x-auto">
      {plasmid ? <table className="data-table min-w-[640px]">
        <caption className="px-5 py-4 text-left text-sm font-bold">Whole plasmid samples · one sample per tube or well</caption>
        <thead><tr><th>Location</th><th>Plasmid / sample name</th><th>Expected size</th><th>DNA concentration</th><th>Notes</th></tr></thead>
        <tbody>{order.samples.map((sample, index) => <tr key={index}><td>{order.container === "Plate" ? `${sample.plateLabel} / ${sample.well}` : sample.tubeLabel}</td><td><strong>{sample.sampleName}</strong><p className="text-xs text-slate-500">{sample.sampleKey}</p></td><td>{sample.templateLength ? `${sample.templateLength} bp` : "Not provided"}</td><td>{sample.concentration ? `${sample.concentration} ng/µL` : "Not provided"}</td><td className="whitespace-pre-wrap">{sample.notes || "—"}</td></tr>)}</tbody>
      </table> : <table className="data-table min-w-[640px]">
        <caption className="px-5 py-4 text-left text-sm font-bold">{readyToLoad ? "Prepared reactions · one reaction per tube or well" : "Samples and primers · one row per physical sample"}</caption>
        <thead><tr><th>Location</th><th>{readyToLoad ? "Sample name" : "DNA name"}</th><th>{readyToLoad ? "Original DNA type" : "DNA type"}</th><th>{readyToLoad ? "Primer used" : "Primer(s)"}</th><th>Details</th></tr></thead>
        <tbody>{order.samples.map((sample, index) => <tr key={index}>
          <td>{order.container === "Plate" ? `${sample.plateLabel} / ${sample.well}` : sample.tubeLabel || "Not recorded"}</td>
          <td><strong>{sample.sampleName}</strong><p className="text-xs text-slate-500">{sample.sampleKey}</p></td>
          <td>{sample.templateType}</td>
          <td>{sample.reactions.length === 1 ? <><strong>{primerName(sample.reactions[0].primerName)}</strong><p className="text-xs text-slate-500">{primerSource(sample.reactions[0].primerSource)}</p></> : <details><summary className="cursor-pointer font-semibold">{sample.reactions.length} primers / reactions</summary><ol className="mt-2 list-decimal space-y-2 pl-4">{sample.reactions.map((r, i) => <li key={i}><strong>{primerName(r.primerName)}</strong><p className="text-xs text-slate-500">{primerSource(r.primerSource)}</p></li>)}</ol></details>}</td>
          <td><details><summary className="cursor-pointer text-sm font-semibold">Sample / primer details</summary><div className="mt-3 space-y-3 text-sm">
            <p>{sample.templateLength ? `${sample.templateLength} bp` : "Length not provided"}<br />{sample.concentration ? `${sample.concentration}${order.intakeVersion === 1 ? "" : " ng/µL"}` : "DNA concentration not provided"}</p>
            <p><strong>Preparation:</strong> {sample.preparation}</p>
            {sample.notes && <p className="whitespace-pre-wrap"><strong>Notes:</strong> {sample.notes}</p>}
            {sample.reactions.map((r, i) => <div key={i} className="space-y-1 border-t border-slate-200 pt-2">
              <p><strong>{primerName(r.primerName)}</strong> · {primerSource(r.primerSource)}</p>
              {r.primerSource === "Customer supplied" && <p>{r.primerConcentration ? `${r.primerConcentration} pmol/µL` : "Primer concentration not provided"}</p>}
              {r.primerSource === "Stored at SeqForge" && <p>Reference: {r.storedPrimerReference}</p>}
              {r.primerSource === "SeqForge synthesized primer" && <>
                <p className="max-w-md break-all font-mono text-xs">5′–{r.primerSequence || "Sequence not recorded"}–3′</p>
                <p>{order.intakeVersion === 1 ? "Synthesis specifications not recorded" : `${r.purification} · ${r.synthesisScale}`}</p>
                {(r.modification5 || r.modification3 || r.modificationInternal) && <p>Modifications: 5′ {r.modification5 || "none"}; 3′ {r.modification3 || "none"}; internal {r.modificationInternal || "none"}</p>}
              </>}
              <p><strong>Special protocol:</strong> {r.specialProtocol}</p>
            </div>)}
          </div></details></td>
        </tr>)}</tbody>
      </table>}
    </div>
    <div className="border-t border-slate-200 p-5 text-sm"><strong>Instructions</strong><p className="mt-2 whitespace-pre-wrap">{order.specialInstructions || "No additional instructions."}</p></div>
    <OrderPricing snapshot={order.pricingSnapshot} historical={Boolean(order.orderNumber)} />
  </section>;
}

function OligoManifest({ order }: { order: ManifestOrder }) {
  const oligo = readOligoSnapshot(order.oligoSnapshot ?? { items: order.oligos, shippingAddress: order.oligoShippingAddress, format: order.oligoFormat });
  const parsed = orderDefaultsSchema.safeParse(order.fulfillmentSnapshot);
  const details = parsed.success ? parsed.data : null;
  return <section className="panel submission-manifest">
    <div className="panel-heading"><div><p className="eyebrow">Oligo synthesis request</p><h2 className="mt-1 text-lg font-bold">{order.orderName || "Untitled order"}</h2>{order.orderNumber && <p className="mt-1 font-mono text-sm">{order.orderNumber}</p>}</div><span className="metric-pill">{oligo?.items.length ?? 0} oligos · {oligo?.items.reduce((sum, item) => sum + item.sequence.length, 0) ?? 0} bases</span></div>
    <div className="space-y-3 border-b border-slate-200 p-5 text-sm">
      <p><strong>Service:</strong> {order.submissionMode === "Oligo modified" ? "Modified DNA oligos" : "Standard DNA oligos"} · Individual tubes</p>
      <p><strong>Requested format:</strong> {oligo?.format || "Not recorded"} · Format and any resuspension details are subject to lab confirmation.</p>
      <p><strong>PO / reference:</strong> {order.poNumber || "Not provided"}</p>
      <div className="grid gap-4 sm:grid-cols-2"><div><p className="whitespace-pre-wrap"><strong>Deliver oligos to:</strong><br />{oligo?.shippingAddress || "Not recorded"}</p>{details && <p className="mt-2"><strong>Contact:</strong> {details.contactName} · {details.contactPhone}</p>}</div>{details && <div><p><strong>Bill to:</strong> {details.billingOrganization}</p><p>{details.billingContactName} · {details.billingEmail}</p><p className="whitespace-pre-wrap">{details.billingAddress}</p><p><strong>PI:</strong> {details.piName || "Not provided"}</p><p><strong>Payment method:</strong> {details.paymentMethod} · No payment collected</p></div>}</div>
    </div>
    {oligo ? <div className="overflow-x-auto"><table className="data-table min-w-[640px]"><caption className="px-5 py-4 text-left text-sm font-bold">Requested synthesis specifications · sequences written 5′ to 3′</caption><thead><tr><th>Oligo</th><th>DNA sequence</th><th>Scale / purification</th><th>Modifications / notes</th></tr></thead><tbody>{oligo.items.map((item, i) => <tr key={i}><td><strong>{item.name}</strong><p className="mt-1 text-xs text-slate-500">{item.sequence.length} bases</p></td><td className="max-w-sm break-all font-mono text-xs">5′–{item.sequence}–3′</td><td>{item.synthesisScale}<br />{item.purification}</td><td className="max-w-xs whitespace-pre-wrap break-words"><p>5′: {item.modification5 || "None"}</p><p>3′: {item.modification3 || "None"}</p><p>Internal: {item.modificationInternal || "None"}</p>{item.notes && <p className="mt-2">{item.notes}</p>}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-red-700">Oligo specifications could not be read. Contact the lab before processing.</p>}
    <div className="border-t border-slate-200 p-5 text-sm"><strong>Instructions</strong><p className="mt-2 whitespace-pre-wrap">{order.specialInstructions || "No additional instructions."}</p></div>
    <OrderPricing snapshot={order.pricingSnapshot} historical={Boolean(order.orderNumber)} />
  </section>;
}
