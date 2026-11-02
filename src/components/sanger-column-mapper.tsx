"use client";

import { useState } from "react";
import { hasPrimerCommas, MAPPING_FIELDS, sangerMappingFieldAllowed, sangerMappingOptions, suggestMapping, type MappingSheet, type MappingSource } from "@/lib/sanger-column-mapping";
import type { PrimerCommaMode } from "@/lib/sanger-entry";
import type { OrderDraft } from "@/lib/order-intake";
import { FRAGMENT_MAPPING_FIELDS } from "@/lib/fragment-entry";
import { PLASMID_MAPPING_FIELDS } from "@/lib/whole-plasmid";

export function SangerColumnMapper({ sheet, source, container, standard, wholePlasmid = false, fragment = false, onChange, onSourceChange, onPreview }: {
  sheet: MappingSheet; source: MappingSource; container: OrderDraft["container"]; standard: boolean; wholePlasmid?: boolean; fragment?: boolean;
  onChange: (sheet: MappingSheet) => void; onSourceChange: (source: MappingSource) => void; onPreview: () => void;
}) {
  const examples = sheet.rows.slice(sheet.hasHeader ? 1 : 0, sheet.hasHeader ? 4 : 3);
  const ignored = sheet.columns.filter(column => !column).length;
  const separatePrimerColumns = sheet.columns.some(column => column === "customerPrimer" || column === "universalPrimer");
  const hasSourceColumn = sheet.columns.includes("primerSource");
  const [additional, setAdditional] = useState(false);
  const context = { container, standard, source };
  const sampleOnlyFields = fragment ? FRAGMENT_MAPPING_FIELDS.filter(field => container === "Plate" ? field !== "tubeLabel" : !["plateLabel", "well"].includes(field)) : PLASMID_MAPPING_FIELDS;
  return <section className="rounded-xl border border-teal-200 bg-white p-4 sm:p-5 space-y-4" aria-label="Column mapping">
    <div><h3 className="text-lg font-bold">Confirm your columns</h3><p className="mt-1 text-sm text-slate-600">Check every match against the example values. Extra columns can be ignored. Nothing is added until you preview and apply.</p></div>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={sheet.hasHeader} onChange={event => onChange({ ...sheet, hasHeader: event.target.checked, columns: suggestMapping(sheet.rows, event.target.checked, container) })} />First row contains column headers</label>
    {!wholePlasmid && !fragment && <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" className="mt-1" checked={additional} onChange={event => setAdditional(event.target.checked)} /><span>Show additional mapping fields<span className="block text-xs text-slate-500">{standard ? "For mixed primer sources, sample IDs and special treatment columns." : "For sample IDs and special treatment columns."} Recognized fields in your file remain visible.</span></span></label>}
    <div className="overflow-x-auto max-h-96 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Your column</th><th className="p-3">Example values</th><th className="p-3">Use as</th></tr></thead><tbody>{sheet.columns.map((field, index) => <tr key={index} className={`border-t border-slate-100 ${!field ? "bg-slate-50 text-slate-500" : ""}`}>
      <td className="p-3 max-w-52 break-words"><span className="text-xs text-slate-400">{index + 1}. </span>{sheet.hasHeader ? sheet.rows[0].cells[index] || "(empty header)" : `Column ${index + 1}`}</td>
      <td className="p-3 max-w-64 break-words">{examples.map(row => row.cells[index] || "(blank)").join(" · ")}</td>
      <td className="p-3"><select aria-label={`Column ${index + 1} maps to`} className="field-input min-w-56" value={field} onChange={event => onChange({ ...sheet, columns: sheet.columns.map((value, i) => i === index ? event.target.value : value) })}>{(wholePlasmid || fragment ? MAPPING_FIELDS.filter(([value]) => sampleOnlyFields.includes(value) || value === field) : sangerMappingOptions(context, additional, field)).map(([value, label]) => <option key={value} value={value}>{(wholePlasmid || fragment ? !sampleOnlyFields.includes(value) : !sangerMappingFieldAllowed(value, context)) ? `${label} — ignore or remap` : label}</option>)}</select></td>
    </tr>)}</tbody></table></div>
    <p className="text-sm text-slate-600">{ignored} column(s) will be ignored. {!fragment && "Length is in bp; DNA concentration is in ng/µL. Units are not converted. Missing DNA type defaults to Plasmid DNA; verify it after import."}</p>
    {fragment ? <p className="rounded-lg bg-teal-50 p-3 text-sm">Each row is one fluorescent PCR sample. Dye and analysis settings are entered once for the order.</p> : wholePlasmid ? <p className="rounded-lg bg-teal-50 p-3 text-sm">Each row represents one purified plasmid sample. Primer columns are not used for this service.</p> : standard ? separatePrimerColumns ? <fieldset className="rounded-lg border border-teal-200 bg-teal-50 p-4">
      <legend className="field-label px-1">Confirm your primer sources</legend>
      <p className="text-sm text-slate-600">Your spreadsheet has separate primer columns. Customer-supplied primers come from you; SeqForge stock primers come from our laboratory. Review the column matches above.</p>
      <label className="mt-3 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1" checked={source === "primer-columns"} onChange={event => onSourceChange(event.target.checked ? "primer-columns" : "")} />Use the primer sources shown in my columns</label>
    </fieldset> : <label className="block"><span className="field-label">Where do the primers come from? *</span><select className="field-input mt-2" aria-label="Confirm imported primer source" value={source === "primer-columns" || (source === "column" && !hasSourceColumn) ? "" : source} onChange={event => onSourceChange(event.target.value as MappingSource)}>
      <option value="">Choose a primer source</option>
      <option value="Customer supplied">Customer supplied</option>
      <option value="SeqForge universal primer">Universal</option>
      <option value="Stored at SeqForge">Stored at SeqForge</option>
      {hasSourceColumn && <option value="column">Use each row’s Primer source</option>}
    </select><span className="mt-2 block text-xs text-slate-500">{hasSourceColumn ? "Your spreadsheet includes a Primer source column. Use its values, or map that column to Ignore to choose one source for all rows." : "This choice applies to all rows. For different sources, include a Primer source column in your spreadsheet."} Universal primers are supplied by SeqForge; a name such as T7 alone does not identify the source.</span>{(source === "Stored at SeqForge" || source === "column") && <span className="mt-2 block text-sm text-teal-800">For stored primers, map a Stored primer reference column using the reference provided by our lab. Use a separate row for each primer if the references differ.</span>}</label>
      : <label className="flex items-start gap-2 rounded-lg bg-teal-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={source === "Included in mix"} onChange={event => onSourceChange(event.target.checked ? "Included in mix" : "")} />I confirm DNA and one sequencing primer are already mixed in each tube / well.</label>}
    {!wholePlasmid && !fragment && hasPrimerCommas(sheet) && <label className="block rounded-lg border border-amber-200 bg-amber-50 p-3">
      <span className="field-label">How are commas used in your primer names? *</span>
      <span className="mt-1 block text-sm text-slate-700">For example, does T7,T3 mean two primers or one primer name? This choice applies to all imported primer cells. Review the reaction count before applying.</span>
      <select className="field-input mt-2" value={sheet.primerCommaMode || ""} onChange={event => onChange({ ...sheet, primerCommaMode: event.target.value as PrimerCommaMode })}>
        <option value="">Choose how to read commas</option>
        <option value="split">Separate primers — T7,T3 means two reactions</option>
        <option value="keep">Keep commas within a single primer name</option>
      </select>
      <span className="mt-2 block text-xs text-slate-600">Semicolons always separate primers. For mixed formats, edit the cells before importing. Pre-mixed requires a separate tube or well for each reaction.</span>
    </label>}
    <button type="button" className="button-primary" onClick={onPreview}>Confirm mapping & preview samples</button>
  </section>;
}
