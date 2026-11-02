import { z } from "zod";
import { orderDefaultsSchema } from "@/lib/order-defaults";
import { readFragmentSnapshot } from "@/lib/fragment-analysis";
import { FragmentSamples } from "@/components/fragment-samples";
import { OrderPricing } from "@/components/order-pricing";
import { SampleTableBrowser } from "@/components/sample-table-browser";
import type { SampleTableSample } from "@/lib/sample-groups";
import { readOligoSnapshot, type OligoDraft } from "@/lib/oligo-schema";

export type ManifestOrder = {
  service?: string;
  orderName: string; orderNumber?: string; poNumber: string | null; specialInstructions: string | null;
  priority: string; container: string; submissionMode: string; intakeVersion?: number;
  samples: SampleTableSample[]; pricingSnapshot?: unknown; fulfillmentSnapshot?: unknown;
  fragmentSnapshot?: unknown; fragmentAnalysis?: unknown;
  oligoSnapshot?: unknown; oligos?: OligoDraft[]; oligoShippingAddress?: string; oligoFormat?: string;
};

export function OrderManifest({ order, presentation = "screen" }: { order: ManifestOrder; presentation?: "screen" | "print" }) {
  if (order.service === "OLIGO") return <OligoManifest order={order} presentation={presentation} />;
  const plasmid = order.service === "WHOLE_PLASMID";
  const fragment = order.service === "FRAGMENT_ANALYSIS";
  const fragmentSettings = fragment ? readFragmentSnapshot(order.fragmentSnapshot || order.fragmentAnalysis) : null;
  const parsedDetails = orderDefaultsSchema.safeParse(order.fulfillmentSnapshot);
  const sharing = z.object({ sharedResultEmails: z.array(z.string().email()).optional() }).safeParse(order.fulfillmentSnapshot);
  const recipients = sharing.success ? sharing.data.sharedResultEmails || [] : [];
  const details = parsedDetails.success ? parsedDetails.data : null;
  const reactionCount = order.samples.reduce((sum, sample) => sum + sample.reactions.length, 0);
  return <section className="panel submission-manifest">
    <div className="panel-heading">
      <div><p className="eyebrow">Submission manifest</p><h2 className="mt-1 text-lg font-bold">{order.orderName || "Untitled order"}</h2>{order.orderNumber ? <p className="mt-1 font-mono text-sm">{order.orderNumber}</p> : null}</div>
      <span className="metric-pill">{order.samples.length} physical {order.samples.length === 1 ? "sample" : "samples"}{!plasmid && !fragment && <> · {reactionCount} {reactionCount === 1 ? "reaction" : "reactions"}</>}</span>
    </div>
    <div className="space-y-3 border-b border-slate-200 p-5 text-sm">
      {plasmid && <p><strong>Service:</strong> Whole Plasmid Sequencing · Purified plasmid DNA</p>}
      {order.intakeVersion === 1 ? <p>Legacy demo order: service and container choices were not recorded. Each original entry is preserved as one sample and one reaction.</p> : <p><strong>Priority:</strong> {order.priority} · <strong>Mode:</strong> {order.submissionMode} · <strong>Container:</strong> {order.container}</p>}
      {recipients.length > 0 && <p><strong>Share results with:</strong> {recipients.join(", ")} · Recorded for lab follow-up; no automatic email or account access.</p>}
      <p><strong>PO / reference:</strong> {order.poNumber || "Not provided"}</p>
      {details ? <div className="grid gap-3 sm:grid-cols-2">
        <div><p><strong>Delivery:</strong> {details.deliveryMethod}</p>
          {details.deliveryMethod === "Pickup" ? <><p className="whitespace-pre-wrap"><strong>Pickup:</strong> {details.pickupLocation}</p><p className="whitespace-pre-wrap">{details.pickupInstructions}</p></> : null}
          {details.deliveryMethod === "Dropbox" && details.dropbox && <div className="mt-2 space-y-1"><p><strong>Dropbox:</strong> {details.dropbox.name}</p><p>{details.dropbox.address}</p><p className="whitespace-pre-wrap"><strong>Box location:</strong> {details.dropbox.placementInstructions || "Contact SeqForge to confirm the exact position before depositing samples."}</p><p className="whitespace-pre-wrap"><strong>Collection:</strong> {details.dropbox.pickupSchedule || "Contact SeqForge to confirm the schedule."}</p>{details.dropbox.accessNotes && <p className="whitespace-pre-wrap">{details.dropbox.accessNotes}</p>}<p className="text-slate-500">Include this printed manifest with your labelled samples. Order submission does not confirm sample receipt.</p></div>}
          <p><strong>Contact:</strong> {details.contactName} · {details.contactPhone}</p>
        </div>
        <div><p><strong>PI:</strong> {details.piName || "Not provided"}</p><p><strong>Bill to:</strong> {details.billingOrganization}</p>
          <p>{details.billingContactName} · {details.billingEmail}</p><p className="whitespace-pre-wrap">{details.billingAddress}</p>
          <p><strong>Payment method:</strong> {details.paymentMethod} · No payment collected</p>
        </div>
      </div> : order.orderNumber ? <p>Pickup and billing details were not recorded for this historical order.</p> : null}
      <p className="text-slate-500">{!plasmid && !fragment && "Service, preparation, stored primers, and synthesis requests require lab confirmation. "}Turnaround, delivery and sample acceptance require lab confirmation.</p>
    </div>
    {fragment ? <><div className="space-y-2 border-b border-slate-200 p-5 text-sm"><h3 className="font-bold">Fragment Analysis · fluorescently labeled PCR products</h3>{fragmentSettings ? <><p><strong>Fluorescent dyes:</strong> {fragmentSettings.dyes}</p><p><strong>Expected size range:</strong> {fragmentSettings.minSize}–{fragmentSettings.maxSize} bp</p><p><strong>Requested size standard:</strong> {fragmentSettings.sizeStandard || "Laboratory recommendation requested"}</p><p><strong>Requested results:</strong> {fragmentSettings.resultRequest}</p><p className="font-semibold text-amber-900">Method, sample preparation and price require laboratory confirmation and customer approval before analysis.</p></> : <p role="alert">Analysis settings could not be read. Contact the laboratory before processing.</p>}</div><FragmentSamples samples={order.samples} container={order.container} full={presentation === "print"} /></> : <SampleTableBrowser samples={order.samples} container={order.container} submissionMode={order.submissionMode} service={order.service} intakeVersion={order.intakeVersion} presentation={presentation} />}
    <div className="border-t border-slate-200 p-5 text-sm"><strong>Instructions</strong><p className="mt-2 whitespace-pre-wrap">{order.specialInstructions || "No additional instructions."}</p></div>
    <OrderPricing snapshot={order.pricingSnapshot} historical={Boolean(order.orderNumber)} presentation={presentation} />
  </section>;
}

function OligoManifest({ order, presentation }: { order: ManifestOrder; presentation: "screen" | "print" }) {
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
    <OrderPricing snapshot={order.pricingSnapshot} historical={Boolean(order.orderNumber)} presentation={presentation} />
  </section>;
}
