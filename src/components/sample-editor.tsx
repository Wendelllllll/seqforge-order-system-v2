import type { ReactNode } from "react";
import { blankReaction, MODES, PREPARATIONS, PROTOCOLS, PURIFICATIONS, SCALES, SOURCES, TEMPLATES, UNIVERSAL_PRIMERS, type ReactionDraft, type SampleDraft } from "@/lib/order-intake";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field-label">{label}<span className="mt-2 block">{children}</span>{hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}</label>;
}
export function TextField({ label, value, onChange, hint, required, maxLength = 100, numeric }: { label: string; value: string; onChange: (value: string) => void; hint?: string; required?: boolean; maxLength?: number; numeric?: boolean }) {
  return <Field label={label} hint={hint}><input className="field-input" value={value} onChange={(e) => onChange(e.target.value)} required={required} maxLength={maxLength} inputMode={numeric ? "decimal" : "text"} /></Field>;
}
export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <Field label={label}><select className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></Field>;
}

export function SampleEditor({ sample, number, container, mode, onChange, onRemove, canRemove, canAddReaction }: {
  sample: SampleDraft; number: number; container: string; mode: (typeof MODES)[number];
  onChange: (sample: SampleDraft) => void; onRemove: () => void; canRemove: boolean; canAddReaction: boolean;
}) {
  function update<K extends keyof SampleDraft>(field: K, value: SampleDraft[K]) { onChange({ ...sample, [field]: value }); }
  function updateReaction(index: number, field: keyof ReactionDraft, value: string) {
    update("reactions", sample.reactions.map((reaction, i) => i === index ? { ...reaction, [field]: value } as ReactionDraft : reaction));
  }
  return <fieldset className="min-w-0 border-t border-slate-200 p-5 sm:p-6" aria-label={`Sample ${number}`}>
    <div className="mb-5 flex items-center justify-between gap-3"><h3 className="font-bold">Sample {number} <span className="ml-2 text-sm font-normal text-slate-500">{sample.sampleName}</span></h3><button type="button" className="text-sm font-semibold text-red-700 disabled:opacity-40" onClick={onRemove} disabled={!canRemove}>Remove sample</button></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <TextField label="Sample ID *" value={sample.sampleKey} onChange={(v) => update("sampleKey", v)} required hint="Use this ID to group primers for the same DNA sample." />
      <TextField label="DNA name *" value={sample.sampleName} onChange={(v) => update("sampleName", v)} required />
      {container === "Tubes" ? <TextField label="Tube label *" value={sample.tubeLabel} onChange={(v) => update("tubeLabel", v)} required /> : <>
        <TextField label="Plate label *" value={sample.plateLabel} onChange={(v) => update("plateLabel", v)} required />
        <TextField label="Well *" value={sample.well} onChange={(v) => update("well", v)} required hint="A1–H12. Use another plate label for additional plates." />
      </>}
      <SelectField label="Template type" value={sample.templateType} options={TEMPLATES} onChange={(v) => update("templateType", v as SampleDraft["templateType"])} />
      <TextField label="Template length (bp)" value={sample.templateLength} onChange={(v) => update("templateLength", v)} numeric maxLength={30} hint="Optional if unknown." />
      <TextField label="DNA concentration (ng/µL)" value={sample.concentration} onChange={(v) => update("concentration", v)} numeric maxLength={30} hint="Optional if not measured; lab review may be needed." />
      <SelectField label="Preparation request" value={sample.preparation} options={PREPARATIONS} onChange={(v) => update("preparation", v as SampleDraft["preparation"])} />
      <TextField label="Sample notes" value={sample.notes} onChange={(v) => update("notes", v)} maxLength={500} />
    </div>
    <div className="mt-6 space-y-4">
      {sample.reactions.map((reaction, index) => <fieldset key={index} aria-label={`Reaction ${index + 1}`} className="min-w-0 border border-slate-200 bg-slate-50 p-4">
        <div className="mb-4 flex items-center justify-between gap-3"><h4 className="text-sm font-bold">{sample.sampleKey || `Sample ${number}`} · Reaction {index + 1}</h4><button type="button" className="text-xs font-semibold text-red-700 disabled:opacity-40" disabled={sample.reactions.length === 1} onClick={() => update("reactions", sample.reactions.filter((_, i) => i !== index))}>Remove reaction</button></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField label="Primer source" value={reaction.primerSource} options={SOURCES} onChange={(v) => {
            const next = { ...blankReaction(), primerSource: v as ReactionDraft["primerSource"], specialProtocol: reaction.specialProtocol };
            if (v === "SeqForge universal primer") next.primerName = UNIVERSAL_PRIMERS[0];
            update("reactions", sample.reactions.map((r, i) => i === index ? next : r));
          }} />
          {reaction.primerSource === "SeqForge universal primer" ? <SelectField label="SeqForge primer" value={reaction.primerName} options={UNIVERSAL_PRIMERS} onChange={(v) => updateReaction(index, "primerName", v)} /> : <TextField label="Primer name *" value={reaction.primerName} onChange={(v) => updateReaction(index, "primerName", v)} required />}
          <SelectField label="Special protocol" value={reaction.specialProtocol} options={PROTOCOLS} onChange={(v) => updateReaction(index, "specialProtocol", v)} />
          {reaction.primerSource === "Customer supplied" ? <TextField label="Primer concentration (pmol/µL)" value={reaction.primerConcentration} onChange={(v) => updateReaction(index, "primerConcentration", v)} numeric maxLength={30} hint="Optional if unknown; no concentration is assumed." /> : null}
          {reaction.primerSource === "Stored at SeqForge" ? <TextField label="Stored primer reference *" value={reaction.storedPrimerReference} onChange={(v) => updateReaction(index, "storedPrimerReference", v)} required hint="Enter the lab reference; availability is confirmed by SeqForge." /> : null}
          {reaction.primerSource === "SeqForge synthesized primer" ? <>
            <div className="md:col-span-2 xl:col-span-3"><TextField label="Primer sequence (5′ to 3′) *" value={reaction.primerSequence} onChange={(v) => updateReaction(index, "primerSequence", v)} required maxLength={500} hint="IUPAC DNA letters only. Describe modifications separately." /></div>
            <SelectField label="Purification requested" value={reaction.purification} options={PURIFICATIONS} onChange={(v) => updateReaction(index, "purification", v)} />
            <SelectField label="Synthesis scale requested" value={reaction.synthesisScale} options={SCALES} onChange={(v) => updateReaction(index, "synthesisScale", v)} />
            <TextField label="5′ modification request" value={reaction.modification5} onChange={(v) => updateReaction(index, "modification5", v)} />
            <TextField label="3′ modification request" value={reaction.modification3} onChange={(v) => updateReaction(index, "modification3", v)} />
            <TextField label="Internal modification request" value={reaction.modificationInternal} onChange={(v) => updateReaction(index, "modificationInternal", v)} />
          </> : null}
        </div>
      </fieldset>)}
      <button type="button" className="button-secondary" disabled={!canAddReaction || mode !== "Standard"} onClick={() => update("reactions", [...sample.reactions, blankReaction()])}>Add primer / reaction to this sample</button>
    </div>
  </fieldset>;
}
