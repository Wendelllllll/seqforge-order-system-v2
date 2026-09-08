import { OrderPricing } from "@/components/order-pricing";
import type { ReactionDraft } from "@/lib/order-intake";

type ManifestSample = {
  sampleKey: string; sampleName: string; tubeLabel: string; plateLabel: string; well: string;
  templateType: string; templateLength: string; concentration: string | null;
  preparation: string; notes: string | null;
  reactions: { [K in keyof ReactionDraft]: string }[];
};
export type ManifestOrder = {
  orderName: string; orderNumber?: string; poNumber: string | null; specialInstructions: string | null;
  priority: string; container: string; submissionMode: string; intakeVersion?: number;
  samples: ManifestSample[]; pricingSnapshot?: unknown;
};

export function OrderManifest({ order }: { order: ManifestOrder }) {
  const reactions = order.samples.flatMap((sample) => sample.reactions.map((reaction, index) => ({ sample, reaction, index })));
  return <section className="panel submission-manifest">
    <div className="panel-heading">
      <div><p className="eyebrow">Submission manifest · V3</p><h2 className="mt-1 text-lg font-bold">{order.orderName || "Untitled order"}</h2>{order.orderNumber ? <p className="mt-1 font-mono text-sm">{order.orderNumber}</p> : null}</div>
      <span className="metric-pill">{order.samples.length} physical {order.samples.length === 1 ? "sample" : "samples"} · {reactions.length} {reactions.length === 1 ? "reaction" : "reactions"}</span>
    </div>
    <div className="space-y-3 border-b border-slate-200 p-5 text-sm">
      {order.intakeVersion === 1 ? <p>Legacy demo order: service and container choices were not recorded. Each original entry is preserved as one sample and one reaction.</p> : <p><strong>Priority:</strong> {order.priority} · <strong>Mode:</strong> {order.submissionMode} · <strong>Container:</strong> {order.container}</p>}
      <p><strong>PO / reference:</strong> {order.poNumber || "Not provided"}</p>
      <p className="text-slate-500">Service, preparation, stored primers, and synthesis requests require lab confirmation. Turnaround, delivery and sample acceptance require lab confirmation.</p>
    </div>
    <div className="overflow-x-auto">
      <table className="data-table min-w-[780px]">
        <caption className="px-5 py-4 text-left text-sm font-bold">Physical samples</caption>
        <thead><tr><th>ID / DNA name</th><th>Location</th><th>Template</th><th>Length / DNA concentration</th><th>Preparation / notes</th></tr></thead>
        <tbody>{order.samples.map((sample, index) => <tr key={index}>
          <td><strong>{sample.sampleKey}</strong><p>{sample.sampleName}</p></td>
          <td>{order.container === "Plate" ? `${sample.plateLabel} / ${sample.well}` : sample.tubeLabel || "Not recorded"}</td>
          <td>{sample.templateType}</td>
          <td>{sample.templateLength ? `${sample.templateLength} bp` : "Length not provided"}<p>{sample.concentration ? `${sample.concentration}${order.intakeVersion === 1 ? "" : " ng/µL"}` : "Concentration not provided"}</p></td>
          <td>{sample.preparation}<p className="whitespace-pre-wrap">{sample.notes}</p></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="overflow-x-auto border-t border-slate-200">
      <table className="data-table min-w-[780px]">
        <caption className="px-5 py-4 text-left text-sm font-bold">Requested sequencing reactions</caption>
        <thead><tr><th>Sample / reaction</th><th>Primer</th><th>Source / details</th><th>Special protocol</th></tr></thead>
        <tbody>{reactions.map(({ sample, reaction: r, index }, row) => <tr key={row}>
          <td>{sample.sampleKey} / {index + 1}</td><td className="font-semibold">{r.primerName}</td>
          <td><p>{r.primerSource}</p>
            {r.primerSource === "Customer supplied" ? <p>{r.primerConcentration ? `${r.primerConcentration} pmol/µL` : "Primer concentration not provided"}</p> : null}
            {r.primerSource === "Stored at SeqForge" ? <p>Reference: {r.storedPrimerReference}</p> : null}
            {r.primerSource === "SeqForge synthesized primer" ? <div className="mt-1 space-y-1">
              <p className="max-w-md break-all font-mono text-xs">5′–{r.primerSequence || "Sequence not recorded"}–3′</p>
              <p>{order.intakeVersion === 1 ? "Synthesis specifications not recorded" : `${r.purification} · ${r.synthesisScale}`}</p>
              {r.modification5 || r.modification3 || r.modificationInternal ? <p>Modifications: 5′ {r.modification5 || "none"}; 3′ {r.modification3 || "none"}; internal {r.modificationInternal || "none"}</p> : null}
            </div> : null}
          </td><td>{r.specialProtocol}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="border-t border-slate-200 p-5 text-sm"><strong>Instructions</strong><p className="mt-2 whitespace-pre-wrap">{order.specialInstructions || "No additional instructions."}</p></div>
    <OrderPricing snapshot={order.pricingSnapshot} historical={Boolean(order.orderNumber)} />
  </section>;
}
