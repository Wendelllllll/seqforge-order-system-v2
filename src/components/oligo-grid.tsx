"use client";

import { Plus, Trash2 } from "lucide-react";
import { blankOligo, MAX_OLIGO_ROWS, oligoBaseCount } from "@/lib/oligo-entry";
import { OLIGO_PURIFICATIONS, OLIGO_SCALES, type OligoDraft } from "@/lib/oligo-schema";

export function OligoGrid({ items, modified, onChange, issues = {} }: {
  items: OligoDraft[]; modified: boolean; onChange: (items: OligoDraft[]) => void; issues?: Record<string, string>;
}) {
  function update(index: number, key: keyof OligoDraft, value: string) {
    onChange(items.map((item, i) => i === index ? { ...item, [key]: value } as OligoDraft : item));
  }
  return <div className="sanger-grid-wrap">
    <div className="divide-y divide-slate-200">{items.map((item, index) => {
      const prefix = `oligos.${index}.`;
      const rowIssues = Object.entries(issues).filter(([path]) => path.startsWith(prefix));
      const sequence = item.sequence.replace(/\s/g, "").toUpperCase();
      const invalidSequence = !!sequence && !/^[ACGTRYSWKMBDHVN]+$/.test(sequence);
      const hasModifications = !!(item.modification5 || item.modification3 || item.modificationInternal);
      const input = (key: "modification5" | "modification3" | "modificationInternal", label: string, placeholder: string) => <label className="field-label">{label}<input className="field-input mt-2" aria-label={`Oligo ${index + 1} ${label}`} aria-invalid={!!issues[`${prefix}${key}`]} value={item[key]} maxLength={200} placeholder={placeholder} onChange={event => update(index, key, event.target.value)} /></label>;
      return <fieldset key={index} aria-label={`Oligo ${index + 1}`} className={`min-w-0 space-y-4 p-5 sm:p-6 ${rowIssues.length ? "bg-red-50/40" : ""}`}>
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold"><span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-50 text-xs text-teal-700">{String(index + 1).padStart(2, "0")}</span>Oligo {index + 1}</h3><button className="sanger-remove" type="button" aria-label={`Remove oligo ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="field-label">Oligo name *<input className="field-input mt-2" aria-label={`Oligo ${index + 1} name`} aria-invalid={!!issues[`${prefix}name`]} value={item.name} maxLength={100} placeholder="e.g. Clone-A-F" onChange={event => update(index, "name", event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">Use a unique name for each oligo.</span></label>
          <label className="field-label">DNA sequence · 5′ to 3′ *<textarea className="field-input mt-2 min-h-20 font-mono text-sm" aria-label={`Oligo ${index + 1} sequence`} aria-invalid={invalidSequence || !!issues[`${prefix}sequence`]} value={item.sequence} maxLength={5000} spellCheck={false} autoCapitalize="characters" placeholder="ACGTACGTACGTACGTACGT" onChange={event => update(index, "sequence", event.target.value)} /><span className={`mt-1 block text-xs font-normal ${invalidSequence ? "text-red-700" : "text-slate-500"}`}>{invalidSequence ? "Use DNA IUPAC letters only. Describe modifications separately." : `${oligoBaseCount([item])} bases · Spaces and line breaks are removed; letters are capitalized.`}</span></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">Synthesis scale requested<select className="field-input mt-2" aria-label={`Oligo ${index + 1} synthesis scale`} aria-invalid={!!issues[`${prefix}synthesisScale`]} value={item.synthesisScale} onChange={event => update(index, "synthesisScale", event.target.value)}>{OLIGO_SCALES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="field-label">Purification requested<select className="field-input mt-2" aria-label={`Oligo ${index + 1} purification`} aria-invalid={!!issues[`${prefix}purification`]} value={item.purification} onChange={event => update(index, "purification", event.target.value)}>{OLIGO_PURIFICATIONS.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        {(modified || hasModifications) && <div className="space-y-3 rounded-lg border border-teal-100 bg-teal-50/50 p-4"><div><p className="text-sm font-semibold">Modification requests</p><p className="mt-1 text-xs text-slate-600">Give the exact modification name. For internal modifications, include the base position counted from the 5′ end. Availability is confirmed with your quote.</p>{!modified && <p className="mt-2 text-xs text-amber-800">Standard DNA oligos cannot include modifications. Clear these requests or use the Modified DNA oligos order type.</p>}</div><div className="grid gap-4 sm:grid-cols-2">{input("modification5", "5′ modification", "Optional")}{input("modification3", "3′ modification", "Optional")}<div className="sm:col-span-2">{input("modificationInternal", "Internal modification", "Modification and base position")}</div></div></div>}
        <details open={!!issues[`${prefix}notes`] || undefined}><summary className="cursor-pointer text-sm font-semibold text-slate-600">Oligo {index + 1} · notes{item.notes ? " added" : " (optional)"}</summary><textarea aria-label={`Oligo ${index + 1} notes`} aria-invalid={!!issues[`${prefix}notes`]} className="field-input mt-3" value={item.notes} maxLength={500} placeholder="Requirements for this oligo" onChange={event => update(index, "notes", event.target.value)} /></details>
        {rowIssues.length > 0 && <ul role="alert" className="list-disc pl-5 text-sm text-red-700">{rowIssues.map(([path, message]) => <li key={path}>{message}</li>)}</ul>}
      </fieldset>;
    })}</div>
    {!items.length && <p className="p-8 text-center text-sm text-slate-500">Add an oligo or paste your spreadsheet.</p>}
    <div className="sanger-grid-footer"><button type="button" className="button-secondary" disabled={items.length >= MAX_OLIGO_ROWS} onClick={() => onChange([...items, blankOligo()])}><Plus size={16} /> Add oligo</button><span>Up to {MAX_OLIGO_ROWS} oligos per order. All synthesis specifications are subject to lab confirmation.</span></div>
  </div>;
}
