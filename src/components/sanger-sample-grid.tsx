"use client";

import { Plus, Trash2 } from "lucide-react";
import { blankReaction, MAX_REACTIONS, PREPARATIONS, PROTOCOLS, PURIFICATIONS, reactionCount, SCALES, SOURCES, TEMPLATES, UNIVERSAL_PRIMERS, type OrderDraft, type ReactionDraft, type SampleDraft } from "@/lib/order-intake";
import { newSangerSample } from "@/lib/sanger-entry";
import { Field, SelectField, TextField } from "@/components/sample-editor";

export function SangerSampleGrid({ samples, container, mode, onChange, issues }: {
  samples: SampleDraft[]; container: OrderDraft["container"]; mode: OrderDraft["submissionMode"];
  onChange: (samples: SampleDraft[]) => void; issues: Record<string, string>;
}) {
  const standard = mode === "Standard";
  const readyToLoad = mode === "Ready to load";
  const total = reactionCount(samples);
  function changeSample(index: number, sample: SampleDraft) { onChange(samples.map((s, i) => i === index ? sample : s)); }
  function addSample() { onChange([...samples, newSangerSample(samples, container, mode, samples.at(-1)?.templateType)]); }

  return <div className="sanger-grid-wrap">
    <div className="overflow-x-auto">
      <table className={`sanger-grid${readyToLoad ? " sanger-grid-ready" : ""}`}>
        <caption className="sr-only">Editable samples and sequencing primers</caption>
        <thead><tr><th>Sample name *</th><th>{container === "Plate" ? "Plate / well *" : "Tube label *"}</th>{!readyToLoad && <><th>DNA type</th><th>Length (bp)</th><th>DNA (ng/µL)</th></>}<th>{standard ? "Sequencing primers *" : readyToLoad ? "Primer used (optional)" : "Primer in mix"}</th><th><span className="sr-only">Actions</span></th></tr></thead>
        {samples.map((sample, index) => {
          const rowIssues = Object.entries(issues).filter(([path]) => path.startsWith(`samples.${index}.`));
          const prefix = `Sample ${index + 1}`;
          function input(field: "sampleName" | "tubeLabel" | "plateLabel" | "well" | "templateLength" | "concentration", label: string, numeric = false) {
            const error = issues[`samples.${index}.${field}`];
            return <input aria-label={`${prefix} ${label}`} aria-invalid={!!error} className="field-input" value={sample[field]} maxLength={numeric ? 30 : 100} inputMode={numeric ? "decimal" : "text"} placeholder={numeric ? "Optional" : label} onChange={e => changeSample(index, { ...sample, [field]: e.target.value })} />;
          }
          function changeReaction(ri: number, reaction: ReactionDraft) { changeSample(index, { ...sample, reactions: sample.reactions.map((r, i) => i === ri ? reaction : r) }); }
          return <tbody key={sample.sampleKey} className={rowIssues.length ? "sanger-row-error" : ""}>
            <tr>
              <td><span className="sanger-row-index">{String(index + 1).padStart(2, "0")}</span>{input("sampleName", "name")}</td>
              <td>{container === "Tubes" ? input("tubeLabel", "tube label") : <div className="space-y-2">{input("plateLabel", "plate label")}{input("well", "well")}</div>}</td>
              {!readyToLoad && <><td><select className="field-input" aria-label={`${prefix} DNA type`} value={sample.templateType} onChange={e => changeSample(index, { ...sample, templateType: e.target.value as SampleDraft["templateType"] })}>{TEMPLATES.map(type => <option key={type}>{type}</option>)}</select></td>
              <td>{input("templateLength", "length", true)}</td><td>{input("concentration", "concentration", true)}</td></>}
              <td className="sanger-primers">
                {sample.reactions.map((reaction, ri) => <div className="sanger-primer" key={ri}>
                  {standard && <select className="field-input" aria-label={`${prefix} primer ${ri + 1} source`} value={reaction.primerSource} onChange={e => changeReaction(ri, { ...blankReaction(), primerSource: e.target.value as ReactionDraft["primerSource"], specialProtocol: reaction.specialProtocol })}>{SOURCES.filter(source => source !== "Included in mix").map(source => <option key={source}>{source}</option>)}</select>}
                  <div className="flex items-center gap-2">
                    {reaction.primerSource === "SeqForge universal primer" ? <select className="field-input" aria-label={`${prefix} primer ${ri + 1} name`} aria-invalid={!!issues[`samples.${index}.reactions.${ri}.primerName`]} value={reaction.primerName} onChange={e => changeReaction(ri, { ...reaction, primerName: e.target.value })}><option value="">Choose a primer</option>{UNIVERSAL_PRIMERS.map(name => <option key={name}>{name}</option>)}</select> : <input className="field-input" aria-label={`${prefix} primer ${ri + 1} name`} aria-invalid={!!issues[`samples.${index}.reactions.${ri}.primerName`]} value={!standard && reaction.primerName === "Included in mix" ? "" : reaction.primerName} placeholder={standard ? "Primer name / tube label" : "Name (optional)"} maxLength={100} onChange={e => changeReaction(ri, { ...reaction, primerName: e.target.value || (!standard ? "Included in mix" : "") })} />}
                    {standard && sample.reactions.length > 1 && <button type="button" className="sanger-remove" aria-label={`Remove ${prefix.toLowerCase()} primer ${ri + 1}`} onClick={() => changeSample(index, { ...sample, reactions: sample.reactions.filter((_, i) => i !== ri) })}><Trash2 size={15} /></button>}
                  </div>
                  {reaction.primerSource === "Stored at SeqForge" && <TextField label="Stored primer reference *" value={reaction.storedPrimerReference} onChange={value => changeReaction(ri, { ...reaction, storedPrimerReference: value })} />}
                  {reaction.primerSource === "SeqForge synthesized primer" && <TextField label="Sequence (5′ to 3′) *" value={reaction.primerSequence} maxLength={500} onChange={value => changeReaction(ri, { ...reaction, primerSequence: value })} />}
                  <details><summary>{readyToLoad ? "Reaction details" : "Primer details"}{reaction.specialProtocol !== "None known" ? ` · ${reaction.specialProtocol}` : ""}</summary><div className="mt-3 space-y-3">
                    {reaction.primerSource === "Customer supplied" && <TextField label="Primer concentration (pmol/µL)" value={reaction.primerConcentration} numeric maxLength={30} onChange={value => changeReaction(ri, { ...reaction, primerConcentration: value })} />}
                    <SelectField label={readyToLoad ? "Protocol used (if applicable)" : "Special protocol"} value={reaction.specialProtocol} options={PROTOCOLS} onChange={value => changeReaction(ri, { ...reaction, specialProtocol: value as ReactionDraft["specialProtocol"] })} />
                    {reaction.primerSource === "SeqForge synthesized primer" && <>
                      <SelectField label="Purification requested" value={reaction.purification} options={PURIFICATIONS} onChange={value => changeReaction(ri, { ...reaction, purification: value as ReactionDraft["purification"] })} />
                      <SelectField label="Synthesis scale" value={reaction.synthesisScale} options={SCALES} onChange={value => changeReaction(ri, { ...reaction, synthesisScale: value as ReactionDraft["synthesisScale"] })} />
                      {(["modification5", "modification3", "modificationInternal"] as const).map((field, i) => <TextField key={field} label={["5′ modification", "3′ modification", "Internal modification"][i]} value={reaction[field]} onChange={value => changeReaction(ri, { ...reaction, [field]: value })} />)}
                    </>}
                  </div></details>
                </div>)}
                {standard && <button type="button" className="sanger-add-primer" disabled={total >= MAX_REACTIONS} onClick={() => changeSample(index, { ...sample, reactions: [...sample.reactions, blankReaction()] })}><Plus size={14} /> Add primer</button>}
              </td>
              <td><button type="button" className="sanger-remove" aria-label={`Remove sample ${index + 1}`} onClick={() => onChange(samples.filter((_, i) => i !== index))}><Trash2 size={17} /></button></td>
            </tr>
            <tr><td colSpan={readyToLoad ? 4 : 7} className="sanger-extra"><details open={readyToLoad && rowIssues.some(([path]) => /\.(templateType|templateLength|concentration|preparation)$/.test(path)) || undefined}><summary>Sample {index + 1} · {readyToLoad ? "notes & original DNA details" : "preparation & notes"}{sample.preparation !== "None requested" ? ` · ${sample.preparation}` : ""}</summary><div className="grid gap-4 pt-3 md:grid-cols-2">
              {readyToLoad && <><SelectField label="Original DNA type" value={sample.templateType} options={TEMPLATES} onChange={value => changeSample(index, { ...sample, templateType: value as SampleDraft["templateType"] })} /><Field label="Original DNA length (bp, optional)">{input("templateLength", "length", true)}</Field><Field label="Original DNA concentration (ng/µL, optional)">{input("concentration", "concentration", true)}</Field></>}
              {standard && <SelectField label="Preparation request" value={sample.preparation} options={PREPARATIONS} onChange={value => changeSample(index, { ...sample, preparation: value as SampleDraft["preparation"] })} />}
              <Field label="Sample notes"><textarea className="field-input" value={sample.notes} maxLength={500} onChange={e => changeSample(index, { ...sample, notes: e.target.value })} /></Field>
            </div></details>
              {rowIssues.length > 0 && <ul className="mt-2 space-y-1 text-sm text-red-700" role="alert">{rowIssues.map(([path, message]) => <li key={path}>{message}</li>)}</ul>}
            </td></tr>
          </tbody>;
        })}
      </table>
    </div>
    {!samples.length && <p className="p-8 text-center text-sm text-slate-500">Add a sample below, or paste your Excel rows.</p>}
    <div className="sanger-grid-footer"><button type="button" className="button-secondary" disabled={total >= MAX_REACTIONS} onClick={addSample}><Plus size={16} /> Add sample</button><span>{standard ? "One DNA sample can have several primers. Each primer adds one reaction." : "One tube or occupied well = one prepared reaction."}</span></div>
  </div>;
}
