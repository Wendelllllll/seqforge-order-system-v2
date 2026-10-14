"use client";

import { Check, Circle, FlaskConical, Waves } from "lucide-react";
import { formatMoney, priceOrder } from "@/lib/pricing";
import { plasmidRateFor, type RateSchedule } from "@/lib/rate-schedule";
import { reactionCount, type OrderDraft } from "@/lib/order-intake";

export function SangerOrderSummary({ draft, step, hasPendingImport, schedule }: { schedule: RateSchedule; draft: OrderDraft; step: "samples" | "details"; hasPendingImport: boolean }) {
  const samples = draft.samples.filter(sample => sample.sampleName.trim());
  const plasmid = draft.service === "WHOLE_PLASMID";
  const reactions = reactionCount(samples);
  const price = samples.length > 0 ? priceOrder({ ...draft, samples }, schedule) : null;
  return <aside className="sanger-live-summary" aria-label="Live order summary">
    <div className="sanger-live-heading"><span className="eyebrow">Your order</span><Waves size={25} strokeWidth={1.5} /></div>
    <h2>{plasmid ? "Whole Plasmid" : "Sanger"} <span>{plasmid ? "Purified plasmid DNA" : draft.submissionMode}</span></h2>
    <div className="sanger-live-counts" aria-live="polite"><div><strong key={`s${samples.length}`}>{samples.length}</strong><span>{draft.container === "Plate" ? "occupied wells" : "sample tubes"}</span></div>{!plasmid && <div><strong key={`r${reactions}`}>{reactions}</strong><span>reactions</span></div>}</div>
    <ol className="sanger-live-progress">
      <li data-active={step === "samples"}>{step === "details" ? <Check size={16} /> : <Circle size={16} />}<span>{plasmid ? "Plasmid samples" : draft.submissionMode === "Ready to load" ? "Prepared reactions" : "Samples & primers"}<small>{step === "details" ? "Sample details checked" : hasPendingImport ? "Confirm and apply your spreadsheet" : "Build your sample list"}</small></span></li>
      <li data-active={step === "details"}><Circle size={16} /><span>Delivery & billing<small>Where to collect and who to bill</small></span></li>
      <li><Circle size={16} /><span>Review & submit<small>One final check before sending</small></span></li>
    </ol>
    {price ? <div className="sanger-live-price">{price.lines.map(line => <p key={line.description}>{plasmid && <span>{line.description.split(" · ").slice(2).join(" · ")}<br /></span>}{line.quantity} {plasmid ? "samples" : "reactions"} × {formatMoney(line.unitCents)}</p>)}<div><span>Sequencing subtotal</span><strong>{formatMoney(price.subtotalCents)}</strong></div><small>USD · Excludes tax, shipping and additional services. No payment collected here.</small>{price.reviewReasons.length > 0 && <details><summary>Price confirmation needed</summary><ul>{price.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>}</div> : <div className="sanger-price-empty">Your sequencing estimate will appear as you add samples.</div>}
    <div className="sanger-live-tip"><FlaskConical size={20} /><p>{plasmid ? `≤12 kb: ${formatMoney(plasmidRateFor(draft.container, false, schedule))}; >12 kb: ${formatMoney(plasmidRateFor(draft.container, true, schedule))} per sample. Enter size in bp; 12 kb = 12,000 bp.` : draft.submissionMode === "Standard" ? "One DNA sample can have several primers. Each primer is a separate reaction." : draft.submissionMode === "Ready to load" ? "One completed sequencing reaction per tube or occupied well. Primer names are optional records." : "One prepared mix, one reaction. Keep additional primers in separate tubes or wells."}</p></div>
    {hasPendingImport && <p className="sanger-import-note" role="status">Spreadsheet not applied yet. Counts reflect your sample table.</p>}
  </aside>;
}
