"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { blankReaction, reactionCount, reactionLimit, sampleLimit, SANGER_PRIMER_SOURCES, TEMPLATES, UNIVERSAL_PRIMERS, type OrderDraft, type ReactionDraft, type SampleDraft } from "@/lib/order-intake";
import { newSangerSample } from "@/lib/sanger-entry";
import { Field, TextField } from "@/components/sample-editor";
import { SangerSampleServices } from "@/components/sanger-sample-services";
import type { RateSchedule } from "@/lib/rate-schedule";
import { groupSamples } from "@/lib/sample-groups";
import { revealSangerSample, sampleStructure, sangerGridView, visibleSangerEntries, type SangerGridView } from "@/lib/sanger-grid-navigation";
import styles from "./sanger-sample-grid.module.css";

function LazyDetails({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>{summary}</summary>{open && children}</details>;
}

export function SangerSampleGrid({ samples, container, mode, schedule, orderAddOnIds, onOrderAddOnsChange, onChange, issues }: {
  samples: SampleDraft[]; container: OrderDraft["container"]; mode: OrderDraft["submissionMode"];
  schedule: RateSchedule; orderAddOnIds?: string[]; onOrderAddOnsChange?: (ids: string[]) => void;
  onChange: (samples: SampleDraft[]) => void; issues: Record<string, string>;
}) {
  const standard = mode === "Standard";
  const total = useMemo(() => reactionCount(samples), [samples]);
  const namedSamples = useMemo(() => samples.filter(sample => sample.sampleName.trim()), [samples]);
  const namedReactions = useMemo(() => reactionCount(namedSamples), [namedSamples]);
  const unnamedRows = samples.length - namedSamples.length;
  const groups = useMemo(() => groupSamples(samples, container), [samples, container]);
  const namedGroups = useMemo(() => groupSamples(namedSamples, container), [namedSamples, container]);
  const [view, setView] = useState(() => sangerGridView(samples, container));
  const [search, setSearch] = useState("");
  const [lastErrorKey, setLastErrorKey] = useState("");
  const signature = sampleStructure(samples, container);
  let currentView = view;
  if (view.signature !== signature) {
    // A new import, restore, or external removal changed the sample list.
    currentView = sangerGridView(samples, container, { pageSize: view.pageSize });
    setView(currentView);
  }
  const visible = visibleSangerEntries(samples, currentView);
  const pages = Math.max(1, Math.ceil(currentView.keys.length / currentView.pageSize));
  const showNavigation = samples.length > 24 || groups.length > 1 || !!search || !!currentView.query;
  const hasOrderServices = !!onOrderAddOnsChange && (!!orderAddOnIds?.length || schedule.addOns?.some(item => item.service === "SANGER" && item.scope === "order" && item.active && item.unitCents !== null));
  const issuesBySample = useMemo(() => {
    const result = new Map<number, [string, string][]>();
    for (const entry of Object.entries(issues)) {
      const match = /^samples\.(\d+)\./.exec(entry[0]);
      if (match) { const index = Number(match[1]); result.set(index, [...result.get(index) || [], entry]); }
    }
    return result;
  }, [issues]);
  const errorIndices = [...issuesBySample.keys()].filter(index => samples[index]).sort((a, b) => a - b);
  function navigate(options: Partial<SangerGridView>) {
    setView(sangerGridView(samples, container, { ...currentView, ...options }));
  }
  function changeSample(index: number, sample: SampleDraft) { onChange(samples.map((s, i) => i === index ? sample : s)); }
  function reveal(next: SampleDraft[], sampleKey: string) {
    setSearch(""); setView(revealSangerSample(next, container, sampleKey, currentView.pageSize));
  }
  function addSample() {
    const sample = newSangerSample(samples, container, mode, samples.at(-1)?.templateType);
    const next = [...samples, sample]; reveal(next, sample.sampleKey); onChange(next);
  }
  function removeSample(index: number) {
    const next = samples.filter((_, i) => i !== index);
    setView(sangerGridView(next, container, currentView)); onChange(next);
  }
  function showNextError() {
    const lastIndex = errorIndices.findIndex(index => samples[index].sampleKey === lastErrorKey);
    const index = errorIndices[(lastIndex + 1) % errorIndices.length];
    const sample = samples[index];
    if (!sample) return;
    setLastErrorKey(sample.sampleKey); reveal(samples, sample.sampleKey);
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-sanger-row="${index}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      row?.querySelector<HTMLElement>('[aria-invalid="true"], input, select')?.focus({ preventScroll: true });
    });
  }

  return <div className="sanger-grid-wrap">
    <div className={styles.controls}>
      <div className={styles.overview}><strong>{namedSamples.length} {namedSamples.length === 1 ? "sample" : "samples"} · {namedReactions} {namedReactions === 1 ? "reaction" : "reactions"}</strong><span>{container === "Plate" ? `${namedGroups.length} plates · ` : ""}Viewing {currentView.query.trim() ? "search results" : currentView.groupLabel}{unnamedRows > 0 && ` · ${unnamedRows} unnamed ${unnamedRows === 1 ? "row" : "rows"}`}</span></div>
      {showNavigation && <><div className={styles.navigation}>
        {container === "Plate" && <label>Plate<select className="field-input" aria-label="Choose plate to edit" value={currentView.groupId} onChange={event => { setSearch(""); navigate({ groupId: event.target.value, query: "", page: 0 }); }}>
          {!groups.some(group => group.id === currentView.groupId) && <option value={currentView.groupId}>{currentView.groupLabel} (editing)</option>}
          {groups.map(group => {
            const named = namedGroups.find(item => item.id === group.id);
            const unnamed = group.sampleCount - (named?.sampleCount ?? 0);
            return <option key={group.id} value={group.id}>{group.label} · {named?.sampleCount ?? 0} samples · {named?.reactionCount ?? 0} reactions{unnamed > 0 && ` · ${unnamed} unnamed`}</option>;
          })}
        </select></label>}
        <label className={styles.search}>Find a sample<input className="field-input" aria-label="Search samples across all plates" placeholder="Sample, plate, well or primer" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); navigate({ query: search, page: 0 }); } }} /></label>
        <button type="button" className="button-secondary" onClick={() => navigate({ query: search, page: 0 })}>Search</button>
        {(search || currentView.query) && <button type="button" className={styles.clear} onClick={() => { setSearch(""); navigate({ query: "", page: 0 }); }}>Clear</button>}
      </div>
      <div className={styles.pagination}>
        <label>Rows <select aria-label="Samples per page" value={currentView.pageSize} onChange={event => navigate({ pageSize: Number(event.target.value) as 24 | 48, page: 0 })}><option value={24}>24</option><option value={48}>48</option></select></label>
        <span aria-live="polite">{currentView.keys.length ? `${currentView.page * currentView.pageSize + 1}–${Math.min((currentView.page + 1) * currentView.pageSize, currentView.keys.length)} of ${currentView.keys.length}` : "No matching samples"}</span>
        <button type="button" disabled={currentView.page === 0} onClick={() => navigate({ page: currentView.page - 1 })}>Previous</button><span>Page {currentView.page + 1} of {pages}</span><button type="button" disabled={currentView.page + 1 >= pages} onClick={() => navigate({ page: currentView.page + 1 })}>Next</button>
      </div></>}
      {errorIndices.length > 0 && <div className={styles.errors} role="alert"><span>{errorIndices.length} samples need review across this order.</span><button type="button" onClick={showNextError}>Show next sample to review</button></div>}
      {hasOrderServices && samples[0] && !visible.some(entry => entry.index === 0) ? <button type="button" className={styles.clear} onClick={() => reveal(samples, samples[0].sampleKey)}>View entire-order services on sample 1</button> : null}
    </div>
    <div className="overflow-x-auto">
      <table className="sanger-grid sanger-services-grid" style={{ minWidth: 850 }}>
        <caption className="sr-only">Editable samples and sequencing primers</caption>
        <thead><tr><th style={{ width: "15%" }}>Sample name *</th><th style={{ width: "11%" }}>{container === "Plate" ? "Plate / well *" : "Tube label *"}</th><th style={{ width: "12%" }}>DNA type</th><th style={{ width: "8%" }}>Length (bp)</th><th style={{ width: "8%" }}>DNA (ng/µL)</th><th style={{ width: "24%" }}>{standard ? "Sequencing primers *" : "Primer in mix"}</th><th style={{ width: "18%" }}>Additional services</th><th style={{ width: "4%" }}><span className="sr-only">Actions</span></th></tr></thead>
        {visible.map(({ sample, index }) => {
          const rowIssues = issuesBySample.get(index) || [];
          const prefix = `Sample ${index + 1}`;
          function input(field: "sampleName" | "tubeLabel" | "plateLabel" | "well" | "templateLength" | "concentration", label: string, numeric = false) {
            const error = issues[`samples.${index}.${field}`];
            return <input aria-label={`${prefix} ${label}`} aria-invalid={!!error} className="field-input" value={sample[field]} maxLength={numeric ? 30 : 100} inputMode={numeric ? "decimal" : "text"} placeholder={numeric ? "Optional" : label} onChange={e => changeSample(index, { ...sample, [field]: e.target.value })} />;
          }
          function changeReaction(ri: number, reaction: ReactionDraft) { changeSample(index, { ...sample, reactions: sample.reactions.map((r, i) => i === ri ? reaction : r) }); }
          return <tbody key={sample.sampleKey} data-sanger-row={index} className={rowIssues.length ? "sanger-row-error" : ""}>
            <tr>
              <td><span className="sanger-row-index">{String(index + 1).padStart(2, "0")}</span>{input("sampleName", "name")}</td>
              <td>{container === "Tubes" ? input("tubeLabel", "tube label") : <div className="space-y-2">{input("plateLabel", "plate label")}{input("well", "well")}</div>}</td>
              <td><select className="field-input" aria-label={`${prefix} DNA type`} value={sample.templateType} onChange={e => changeSample(index, { ...sample, templateType: e.target.value as SampleDraft["templateType"] })}>{TEMPLATES.map(type => <option key={type}>{type}</option>)}</select></td>
              <td>{input("templateLength", "length", true)}</td><td>{input("concentration", "concentration", true)}</td>
              <td className="sanger-primers">
                {sample.reactions.map((reaction, ri) => <div className="sanger-primer" key={ri}>
                  {standard && <select className="field-input" aria-label={`${prefix} primer ${ri + 1} source`} value={(SANGER_PRIMER_SOURCES as readonly string[]).includes(reaction.primerSource) ? reaction.primerSource : ""} onChange={e => changeReaction(ri, { ...blankReaction(), primerSource: e.target.value as ReactionDraft["primerSource"], specialProtocol: reaction.specialProtocol, addOnIds: reaction.addOnIds })}>{!(SANGER_PRIMER_SOURCES as readonly string[]).includes(reaction.primerSource) && <option value="" disabled>Choose a current primer source</option>}{SANGER_PRIMER_SOURCES.map(source => <option key={source} value={source}>{source === "SeqForge universal primer" ? "Universal" : source}</option>)}</select>}
                  <div className="flex items-center gap-2">
                    {reaction.primerSource === "SeqForge universal primer" ? <select className="field-input" aria-label={`${prefix} primer ${ri + 1} name`} aria-invalid={!!issues[`samples.${index}.reactions.${ri}.primerName`]} value={reaction.primerName} onChange={e => changeReaction(ri, { ...reaction, primerName: e.target.value })}><option value="">Choose a primer</option>{UNIVERSAL_PRIMERS.map(name => <option key={name}>{name}</option>)}</select> : <input className="field-input" aria-label={`${prefix} primer ${ri + 1} name`} aria-invalid={!!issues[`samples.${index}.reactions.${ri}.primerName`]} value={!standard && reaction.primerName === "Included in mix" ? "" : reaction.primerName} placeholder={standard ? "Primer name / tube label" : "Name (optional)"} maxLength={100} onChange={e => changeReaction(ri, { ...reaction, primerName: e.target.value || (!standard ? "Included in mix" : "") })} />}
                    {standard && sample.reactions.length > 1 && <button type="button" className="sanger-remove" aria-label={`Remove ${prefix.toLowerCase()} primer ${ri + 1}`} onClick={() => changeSample(index, { ...sample, reactions: sample.reactions.filter((_, i) => i !== ri) })}><Trash2 size={15} /></button>}
                  </div>
                  {reaction.primerSource === "Stored at SeqForge" && <TextField label="Stored primer reference *" value={reaction.storedPrimerReference} onChange={value => changeReaction(ri, { ...reaction, storedPrimerReference: value })} />}
                  {reaction.primerSource === "SeqForge synthesized primer" && <p className="text-sm text-amber-800">This draft requests primer synthesis. Choose a current source above; new primers can be ordered through Oligo synthesis.</p>}
                  {reaction.primerSource === "Customer supplied" && <LazyDetails summary="Primer details"><div className="mt-3 space-y-3"><TextField label="Primer concentration (pmol/µL)" value={reaction.primerConcentration} numeric maxLength={30} onChange={value => changeReaction(ri, { ...reaction, primerConcentration: value })} /></div></LazyDetails>}
                </div>)}
                {standard && <button type="button" className="sanger-add-primer" disabled={total >= reactionLimit("SANGER")} onClick={() => changeSample(index, { ...sample, reactions: [...sample.reactions, blankReaction()] })}><Plus size={14} /> Add primer</button>}
              </td>
              <td><SangerSampleServices sample={sample} index={index} mode={mode} schedule={schedule} onChange={value => changeSample(index, value)} orderAddOnIds={orderAddOnIds} onOrderAddOnsChange={onOrderAddOnsChange} /></td>
              <td><button type="button" className="sanger-remove" aria-label={`Remove sample ${index + 1}`} onClick={() => removeSample(index)}><Trash2 size={17} /></button></td>
            </tr>
            <tr><td colSpan={8} className="sanger-extra"><LazyDetails summary={`Sample ${index + 1} · notes`}><div className="pt-3">
              <Field label="Sample notes"><textarea className="field-input" value={sample.notes} maxLength={500} onChange={e => changeSample(index, { ...sample, notes: e.target.value })} /></Field>
            </div></LazyDetails>
              {rowIssues.length > 0 && <ul className="mt-2 space-y-1 text-sm text-red-700" role="alert">{rowIssues.map(([path, message]) => <li key={path}>{message}</li>)}</ul>}
            </td></tr>
          </tbody>;
        })}
      </table>
    </div>
    {!samples.length && <p className="p-8 text-center text-sm text-slate-500">Add a sample below, or paste your Excel rows.</p>}
    <div className="sanger-grid-footer"><button type="button" className="button-secondary" disabled={samples.length >= sampleLimit("SANGER") || total >= reactionLimit("SANGER")} onClick={addSample}><Plus size={16} /> Add sample</button><span>{standard ? "One DNA sample can have several primers. Each primer adds one reaction." : "One tube or occupied well = one prepared reaction."}</span></div>
  </div>;
}
