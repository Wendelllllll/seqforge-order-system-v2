"use client";

import { ArrowRight, FileClock, RotateCcw } from "lucide-react";
import { reactionCount } from "@/lib/order-intake";
import type { SavedOrder } from "@/lib/order-resume";

export function OrderDraftChoice({ saved, onContinue, onRestart, error }: { saved: SavedOrder; onContinue: () => void; onRestart: () => void; error: string }) {
  const plasmid = saved.draft.service === "WHOLE_PLASMID";
  const oligo = saved.draft.service === "OLIGO";
  const samples = saved.draft.samples.filter(sample => sample.sampleName.trim());
  return <section aria-labelledby="unfinished-order-title" className="panel mx-auto max-w-2xl space-y-6 p-6 sm:p-9">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><FileClock aria-hidden="true" size={25} /></div>
    <div><p className="eyebrow">Welcome back</p><h2 id="unfinished-order-title" className="mt-2 text-2xl font-bold text-slate-950">You have an unfinished order</h2><p className="mt-3 text-sm leading-6 text-slate-600">Continue where you left off, or start with a fresh form.</p></div>
    <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/60 p-5 text-sm">
      <p className="font-semibold text-slate-900">{saved.draft.orderName.trim() || "Untitled order"}</p>
      <p>{oligo ? `Oligo synthesis · ${saved.draft.submissionMode === "Oligo modified" ? "Modified DNA" : "Standard DNA"}` : <>{plasmid ? "Whole Plasmid Sequencing" : `Sanger · ${saved.draft.submissionMode}`} · {saved.draft.container === "Plate" ? "96-well plates" : "Tubes"}</>}</p>
      <p>{oligo ? `${saved.draft.oligos?.filter(item => item.name.trim()).length || 0} named oligos` : <>{samples.length} named samples{!plasmid && <> · {reactionCount(samples)} reactions</>}</>}{saved.bulkText.trim() || saved.pendingImport || saved.oligoPendingImport ? " · Spreadsheet work saved" : ""}</p>
      <p className="text-slate-500">Last saved: <time dateTime={new Date(saved.savedAt).toISOString()}>{new Date(saved.savedAt).toLocaleString()}</time></p>
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="button-primary" onClick={onContinue}>Continue draft <ArrowRight size={16} aria-hidden="true" /></button>
      <button type="button" className="button-secondary" onClick={onRestart}><RotateCcw size={16} aria-hidden="true" /> Start a new order</button>
    </div>
    <p className="text-sm leading-6 text-slate-500">Starting a new order discards this {saved.draft.submissionMode} draft. Other submission types and submitted orders stay unchanged. Your saved account defaults will still be available.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
