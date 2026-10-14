"use client";

import { Plus, Trash2 } from "lucide-react";
import { MAX_REACTIONS, type OrderDraft, type SampleDraft } from "@/lib/order-intake";
import { newPlasmidSample } from "@/lib/whole-plasmid";

export function PlasmidSampleGrid({ samples, container, onChange, issues }: { samples: SampleDraft[]; container: OrderDraft["container"]; onChange: (samples: SampleDraft[]) => void; issues: Record<string, string> }) {
  function update(index: number, key: keyof SampleDraft, value: string) { onChange(samples.map((sample, i) => i === index ? { ...sample, [key]: value } : sample)); }
  return <div className="sanger-grid-wrap"><div className="overflow-x-auto"><table className="sanger-grid plasmid-grid">
    <caption className="sr-only">Editable whole plasmid samples</caption>
    <thead><tr><th>Plasmid / sample name *</th><th>{container === "Plate" ? "Plate / well *" : "Tube label *"}</th><th>Expected size (bp)</th><th>DNA (ng/µL)</th><th><span className="sr-only">Actions</span></th></tr></thead>
    {samples.map((sample, index) => {
      const rowIssues = Object.entries(issues).filter(([path]) => path.startsWith(`samples.${index}.`));
      const input = (key: "sampleName" | "tubeLabel" | "plateLabel" | "well" | "templateLength" | "concentration", label: string, numeric = false) => <input className="field-input" aria-label={`Sample ${index + 1} ${label}`} aria-invalid={!!issues[`samples.${index}.${key}`]} value={sample[key]} maxLength={numeric ? 30 : 100} inputMode={numeric ? "decimal" : "text"} placeholder={numeric ? "Optional" : label} onChange={event => update(index, key, event.target.value)} />;
      return <tbody key={sample.sampleKey} className={rowIssues.length ? "sanger-row-error" : ""}><tr>
        <td><span className="sanger-row-index">{String(index + 1).padStart(2, "0")}</span>{input("sampleName", "name")}</td>
        <td>{container === "Tubes" ? input("tubeLabel", "tube label") : <div className="space-y-2">{input("plateLabel", "plate label")}{input("well", "well")}</div>}</td>
        <td>{input("templateLength", "length", true)}</td><td>{input("concentration", "concentration", true)}</td>
        <td><button className="sanger-remove" type="button" aria-label={`Remove sample ${index + 1}`} onClick={() => onChange(samples.filter((_, i) => i !== index))}><Trash2 size={17} /></button></td>
      </tr><tr><td colSpan={5} className="sanger-extra"><details><summary>Sample {index + 1} · notes</summary><textarea aria-label={`Sample ${index + 1} notes`} className="field-input mt-3" value={sample.notes} maxLength={500} placeholder="Construct details or other information for the lab" onChange={event => update(index, "notes", event.target.value)} /></details>{rowIssues.length > 0 && <ul role="alert" className="mt-2 text-sm text-red-700">{rowIssues.map(([path, message]) => <li key={path}>{message}</li>)}</ul>}</td></tr></tbody>;
    })}
  </table></div>{!samples.length && <p className="p-8 text-center text-sm text-slate-500">Add a plasmid sample or paste your spreadsheet.</p>}<div className="sanger-grid-footer"><button type="button" className="button-secondary" disabled={samples.length >= MAX_REACTIONS} onClick={() => onChange([...samples, newPlasmidSample(samples, container)])}><Plus size={16} /> Add sample</button><span>One purified plasmid sample per tube or occupied well. No sequencing primers to enter.</span></div></div>;
}
