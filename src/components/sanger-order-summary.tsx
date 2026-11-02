"use client";

import { Check, Circle, FlaskConical, Waves } from "lucide-react";
import { formatMoney, priceOrder } from "@/lib/pricing";
import { plasmidRateFor, type RateSchedule } from "@/lib/rate-schedule";
import { reactionCount, type OrderDraft } from "@/lib/order-intake";

export function SangerOrderSummary({ draft, step, hasPendingImport, schedule }: { schedule: RateSchedule; draft: OrderDraft; step: "samples" | "details"; hasPendingImport: boolean }) {
  const samples = draft.samples.filter(sample => sample.sampleName.trim());
  const plasmid = draft.service === "WHOLE_PLASMID";
  const fragment = draft.service === "FRAGMENT_ANALYSIS";
  const reactions = reactionCount(samples);
  let pricingError = "";
  const price = (() => { try { return samples.length > 0 ? priceOrder({ ...draft, samples }, schedule) : null; } catch (error) { pricingError = error instanceof Error ? error.message : "Review your additional service selections."; return null; } })();
  return <aside className="sanger-live-summary" aria-label="Live order summary">
    <div className="sanger-live-heading"><span className="eyebrow">Your order</span><Waves size={25} strokeWidth={1.5} /></div>
    <h2>{fragment ? "Fragment Analysis" : plasmid ? "Whole Plasmid" : "Sanger"} <span>{fragment ? "Fluorescent PCR products" : plasmid ? "Purified plasmid DNA" : draft.submissionMode}</span></h2>
    <div className="sanger-live-counts" aria-live="polite"><div><strong key={`s${samples.length}`}>{samples.length}</strong><span>{draft.container === "Plate" ? "occupied wells" : "sample tubes"}</span></div>{!plasmid && !fragment && <div><strong key={`r${reactions}`}>{reactions}</strong><span>reactions</span></div>}</div>
    <ol className="sanger-live-progress">
      <li data-active={step === "samples"}>{step === "details" ? <Check size={16} /> : <Circle size={16} />}<span>{fragment ? "Fragment samples" : plasmid ? "Plasmid samples" : "Samples & primers"}<small>{step === "details" ? "Sample details checked" : hasPendingImport ? "Confirm and apply your spreadsheet" : "Build your sample list"}</small></span></li>
      <li data-active={step === "details"}><Circle size={16} /><span>Delivery & billing<small>Where to collect and who to bill</small></span></li>
      <li><Circle size={16} /><span>Review & submit<small>One final check before sending</small></span></li>
    </ol>
    {fragment ? <div className="sanger-live-price"><strong>Price pending lab confirmation</strong><p>Your submitted order will await method confirmation and a quote. Analysis starts only after customer approval.</p></div> : price ? <div className="sanger-live-price">{price.lines.map((line, index) => <p key={index}>{(plasmid || line.addOnId) && <span>{line.addOnId ? line.description : line.description.split(" · ").slice(2).join(" · ")}<br /></span>}{line.customPrice && <span className="font-semibold text-teal-800">Customer price · </span>}{line.quantity} {line.unit ? `${line.unit}${line.quantity === 1 ? "" : "s"}` : plasmid ? "samples" : "reactions"} × {formatMoney(line.unitCents)}</p>)}<div><span>Order subtotal</span><strong>{formatMoney(price.subtotalCents)}</strong></div><small>USD · Includes selected priced services. Excludes tax, shipping and requests requiring a separate quote. No payment collected here.</small>{price.reviewReasons.length > 0 && <details><summary>Price confirmation needed</summary><ul>{price.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>}</div> : <div className="sanger-price-empty" role={pricingError ? "alert" : undefined}>{pricingError || "Your sequencing estimate will appear as you add samples."}</div>}
    <div className="sanger-live-tip"><FlaskConical size={20} /><p>{fragment ? "One sample per tube or occupied well. No Sanger sequencing primers required." : plasmid ? `≤12 kb: ${formatMoney(plasmidRateFor(draft.container, false, schedule))}; >12 kb: ${formatMoney(plasmidRateFor(draft.container, true, schedule))} per sample. Enter size in bp; 12 kb = 12,000 bp.` : draft.submissionMode === "Standard" ? "One DNA sample can have several primers. Each primer is a separate reaction." : "One prepared mix, one reaction. Keep additional primers in separate tubes or wells."}</p></div>
    {hasPendingImport && <p className="sanger-import-note" role="status">Spreadsheet not applied yet. Counts reflect your sample table.</p>}
  </aside>;
}
