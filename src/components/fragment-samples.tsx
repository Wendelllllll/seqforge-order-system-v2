"use client";
import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Download } from "lucide-react";
import { groupSamples, sampleCsvCell, type SampleTableSample } from "@/lib/sample-groups";
import { revealSangerSample, sampleStructure, sangerGridView, visibleSangerEntries, type SangerGridView } from "@/lib/sanger-grid-navigation";
import { newFragmentSample } from "@/lib/fragment-entry";
import { FRAGMENT_MAX_SAMPLES } from "@/lib/fragment-analysis";
import type { OrderDraft, SampleDraft } from "@/lib/order-intake";
import "./sample-table-browser.css";

export function FragmentSamples({ samples, container, onChange, issues = {}, full = false }: { samples: SampleTableSample[]; container: string; onChange?: (samples: SampleDraft[]) => void; issues?: Record<string, string>; full?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [view, setView] = useState<SangerGridView | null>(null);
  const [lastErrorKey, setLastErrorKey] = useState("");
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupSamples(samples, container), [samples, container]);
  const namedSamples = useMemo(() => samples.filter(sample => sample.sampleName.trim()), [samples]);
  const namedGroups = useMemo(() => groupSamples(namedSamples, container), [namedSamples, container]);
  const unnamed = samples.length - namedSamples.length;
  const browsePlates = container === "Plate" && (groups.length > 1 || samples.length > 24);
  let currentView = view ?? sangerGridView(samples, container);
  if (view && view.signature !== sampleStructure(samples, container)) {
    currentView = sangerGridView(samples, container, view);
    setView(currentView);
  }
  const overview = browsePlates && !view;
  const visible = full ? samples.map((sample, index) => ({ sample, index })) : overview ? [] : visibleSangerEntries(samples, currentView);
  const currentPage = currentView.page;
  const entryCount = currentView.keys.length;
  const issuesBySample = useMemo(() => {
    const result = new Map<number, [string, string][]>();
    for (const entry of Object.entries(issues)) {
      const match = /^samples\.(\d+)\./.exec(entry[0]);
      if (match) { const index = Number(match[1]); result.set(index, [...result.get(index) || [], entry]); }
    }
    return result;
  }, [issues]);
  const errorIndices = [...issuesBySample.keys()].filter(index => samples[index]).sort((a, b) => a - b);
  function navigate(options: Partial<SangerGridView>) { setView(sangerGridView(samples, container, { ...currentView, ...options })); }
  function showNextError() {
    const last = errorIndices.findIndex(index => samples[index].sampleKey === lastErrorKey);
    const index = errorIndices[(last + 1) % errorIndices.length];
    const sample = samples[index];
    if (!sample) return;
    setLastErrorKey(sample.sampleKey); setQuery("");
    setView(revealSangerSample(samples, container, sample.sampleKey, 24));
    requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>(`[data-fragment-row="${index}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      (row?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? row?.querySelector<HTMLElement>('input'))?.focus({ preventScroll: true });
    });
  }
  function edit(index: number, field: "sampleName" | "tubeLabel" | "plateLabel" | "well" | "notes", value: string) { onChange?.(samples.map((sample, i) => i === index ? { ...sample, [field]: value } : sample) as SampleDraft[]); }
  function exportCsv() {
    const rows = [["Sample name", ...(container === "Plate" ? ["Plate label", "Well"] : ["Tube label"]), "Notes"], ...samples.map(s => [s.sampleName, ...(container === "Plate" ? [s.plateLabel, s.well] : [s.tubeLabel]), s.notes])];
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(row => row.map(sampleCsvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "seqforge-fragment-analysis-samples.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const input = (sample: SampleTableSample, index: number, field: "sampleName" | "tubeLabel" | "plateLabel" | "well" | "notes", label: string) => onChange ? <input className="field-input" aria-label={`Sample ${index + 1} ${label}`} aria-invalid={!!issues[`samples.${index}.${field}`]} value={sample[field] || ""} maxLength={field === "notes" ? 500 : 100} onChange={event => edit(index, field, event.target.value)} /> : <span className="block whitespace-pre-wrap break-words">{sample[field] || "—"}</span>;
  return <section ref={root} aria-label="Fragment Analysis samples" className={`min-w-0 space-y-4 p-4 sm:p-5${!onChange && !full ? " fragment-samples--readonly" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{container === "Plate" ? `${namedGroups.length} plates · ` : ""}{namedSamples.length} samples{container === "Plate" ? " / occupied wells" : ""}</strong>{unnamed > 0 && <p className="text-sm text-slate-600">{unnamed} unnamed {unnamed === 1 ? "row" : "rows"}</p>}</div>{!full && samples.length > 0 && <button type="button" className="button-secondary" onClick={exportCsv}><Download size={16} />Download sample list (CSV)</button>}</div>
    {!full && samples.length > 24 && <label className="block text-sm">Find a sample<input type="search" className="field-input mt-2" value={query} placeholder="Sample name, plate, well or tube" onChange={event => { setQuery(event.target.value); navigate({ query: event.target.value, page: 0 }); }} /></label>}
    {!full && browsePlates && <div className="flex flex-wrap gap-2" aria-label="Plates in this Fragment Analysis order">{groups.map(group => <button type="button" key={group.id} className={!overview && !query && currentView.groupId === group.id ? "button-primary" : "button-secondary"} aria-pressed={!overview && !query && currentView.groupId === group.id} onClick={() => { setQuery(""); navigate({ groupId: group.id, query: "", page: 0 }); }}>{group.label} · {namedGroups.find(item => item.id === group.id)?.occupiedWells ?? 0}/96 wells</button>)}</div>}
    {!full && overview && <p className="text-sm text-slate-600">Choose a plate to view or edit its samples. Counts and validation include the entire order.</p>}
    {!full && errorIndices.length > 0 && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{errorIndices.length} samples need review across this order.</span><button type="button" className="button-secondary" onClick={showNextError}>Show next sample to review</button></div>}
    {!full && !overview && !visible.length && <p className="text-sm text-slate-600">No matching samples.</p>}
    {visible.length > 0 && <div className="sample-browser-table-wrap"><table className="data-table min-w-[640px] fragment-sample-table"><caption className="sr-only">Fragment Analysis sample list</caption><thead><tr><th>Sample name</th><th>{container === "Plate" ? "Plate label / well" : "Tube label"}</th><th>Notes</th>{onChange && <th><span className="sr-only">Actions</span></th>}</tr></thead><tbody>{visible.map(({ sample, index }) => <tr key={sample.sampleKey} data-fragment-row={index}>
      <td data-label="Sample name"><span className="mb-1 block text-xs text-slate-400">{index + 1}</span>{input(sample, index, "sampleName", "name")}{(issuesBySample.get(index) || []).map(([key, message]) => <p key={key} className="mt-1 text-xs text-red-700">{message}</p>)}</td>
      <td data-label={container === "Plate" ? "Plate / well" : "Tube label"}>{container === "Plate" ? <div className="space-y-2">{input(sample, index, "plateLabel", "plate label")}{input(sample, index, "well", "well")}</div> : input(sample, index, "tubeLabel", "tube label")}</td><td data-label="Notes">{input(sample, index, "notes", "notes")}</td>
      {onChange && <td><button type="button" className="sanger-remove" aria-label={`Remove sample ${index + 1}`} onClick={() => onChange(samples.filter((_, i) => i !== index) as SampleDraft[])}><Trash2 size={16} /></button></td>}
    </tr>)}</tbody></table></div>}
    {!full && !overview && entryCount > 24 && <div className="flex flex-wrap items-center gap-3 text-sm"><span aria-live="polite">{currentPage * 24 + 1}–{Math.min(entryCount, (currentPage + 1) * 24)} of {entryCount}</span><button type="button" className="button-secondary" disabled={!currentPage} onClick={() => navigate({ page: currentPage - 1 })}>Previous samples</button><button type="button" className="button-secondary" disabled={(currentPage + 1) * 24 >= entryCount} onClick={() => navigate({ page: currentPage + 1 })}>Next samples</button></div>}
    {onChange && <button type="button" className="button-secondary" disabled={samples.length >= FRAGMENT_MAX_SAMPLES} onClick={() => { const next = newFragmentSample(samples as SampleDraft[], container as OrderDraft["container"]); const updated = [...samples, next] as SampleDraft[]; setView(revealSangerSample(updated, container, next.sampleKey, 24)); setQuery(""); onChange(updated); }}><Plus size={16} />Add sample</button>}
  </section>;
}
