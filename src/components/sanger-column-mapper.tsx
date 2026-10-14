"use client";

import { MAPPING_FIELDS, suggestMapping, type MappingSheet, type MappingSource } from "@/lib/sanger-column-mapping";
import type { OrderDraft } from "@/lib/order-intake";
import { PLASMID_MAPPING_FIELDS } from "@/lib/whole-plasmid";

export function SangerColumnMapper({ sheet, source, container, standard, readyToLoad = false, wholePlasmid = false, onChange, onSourceChange, onPreview }: {
  sheet: MappingSheet; source: MappingSource; container: OrderDraft["container"]; standard: boolean; readyToLoad?: boolean; wholePlasmid?: boolean;
  onChange: (sheet: MappingSheet) => void; onSourceChange: (source: MappingSource) => void; onPreview: () => void;
}) {
  const examples = sheet.rows.slice(sheet.hasHeader ? 1 : 0, sheet.hasHeader ? 4 : 3);
  const ignored = sheet.columns.filter(column => !column).length;
  return <section className="rounded-xl border border-teal-200 bg-white p-4 sm:p-5 space-y-4" aria-label="Column mapping">
    <div><h3 className="text-lg font-bold">Confirm your columns</h3><p className="mt-1 text-sm text-slate-600">Check every match against the example values. Extra columns can be ignored. Nothing is added until you preview and apply.</p></div>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={sheet.hasHeader} onChange={event => onChange({ ...sheet, hasHeader: event.target.checked, columns: suggestMapping(sheet.rows, event.target.checked, container) })} />First row contains column headers</label>
    <div className="overflow-x-auto max-h-96 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Your column</th><th className="p-3">Example values</th><th className="p-3">Use as</th></tr></thead><tbody>{sheet.columns.map((field, index) => <tr key={index} className={`border-t border-slate-100 ${!field ? "bg-slate-50 text-slate-500" : ""}`}>
      <td className="p-3 max-w-52 break-words"><span className="text-xs text-slate-400">{index + 1}. </span>{sheet.hasHeader ? sheet.rows[0].cells[index] || "(empty header)" : `Column ${index + 1}`}</td>
      <td className="p-3 max-w-64 break-words">{examples.map(row => row.cells[index] || "(blank)").join(" · ")}</td>
      <td className="p-3"><select aria-label={`Column ${index + 1} maps to`} className="field-input min-w-56" value={field} onChange={event => onChange({ ...sheet, columns: sheet.columns.map((value, i) => i === index ? event.target.value : value) })}>{MAPPING_FIELDS.filter(([value]) => !wholePlasmid || PLASMID_MAPPING_FIELDS.includes(value) || value === field).map(([value, label]) => <option key={value} value={value}>{wholePlasmid && !PLASMID_MAPPING_FIELDS.includes(value) ? `${label} — ignore for this service` : label}</option>)}</select></td>
    </tr>)}</tbody></table></div>
    <p className="text-sm text-slate-600">{ignored} column(s) will be ignored. Length is in bp; DNA concentration is in ng/µL. Units are not converted. Missing DNA type defaults to Plasmid DNA; verify it after import.</p>
    {wholePlasmid ? <p className="rounded-lg bg-teal-50 p-3 text-sm">Each row represents one purified plasmid sample. Primer columns are not used for this service.</p> : standard ? <label className="block"><span className="field-label">Where do the primers come from? *</span><select className="field-input mt-2" aria-label="Confirm imported primer source" value={source} onChange={event => onSourceChange(event.target.value as MappingSource)}>
      <option value="">Choose explicitly — no default source</option>
      <option value="Customer supplied">I will supply all these primers separately</option>
      <option value="SeqForge universal primer">Use SeqForge stock universal primers for all rows</option>
      <option value="column">Use the Primer source column for each row</option>
      <option value="primer-columns">Use My primers / SeqForge Primers columns (old template)</option>
    </select><span className="mt-2 block text-xs text-slate-500">T7 is a primer name, not a source. Select whether you supply it or use SeqForge stock. To override a source column, first map it to Ignore.</span></label>
      : <label className="flex items-start gap-2 rounded-lg bg-teal-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={source === "Included in mix"} onChange={event => onSourceChange(event.target.checked ? "Included in mix" : "")} />{readyToLoad ? "I confirm each tube / well contains one completed sequencing reaction, ready for loading." : "I confirm DNA and one sequencing primer are already mixed in each tube / well."}</label>}
    <button type="button" className="button-primary" onClick={onPreview}>Confirm mapping & preview samples</button>
  </section>;
}
