"use client";

import { OLIGO_MAPPING_FIELDS, suggestOligoMapping } from "@/lib/oligo-entry";
import type { MappingSheet } from "@/lib/sanger-column-mapping";

export function OligoColumnMapper({ sheet, onChange, onPreview }: {
  sheet: MappingSheet; onChange: (sheet: MappingSheet) => void; onPreview: () => void;
}) {
  const examples = sheet.rows.slice(sheet.hasHeader ? 1 : 0, sheet.hasHeader ? 4 : 3);
  const ignored = sheet.columns.filter(column => !column).length;
  return <section className="space-y-4 rounded-xl border border-teal-200 bg-white p-4 sm:p-5" aria-label="Oligo column mapping">
    <div><h3 className="text-lg font-bold">Confirm your columns</h3><p className="mt-1 text-sm text-slate-600">Match your name and sequence columns. Map any synthesis requirements, and ignore columns you do not need. Preview before adding anything to your order.</p></div>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={sheet.hasHeader} onChange={event => onChange({ ...sheet, hasHeader: event.target.checked, columns: suggestOligoMapping(sheet.rows, event.target.checked) })} />First row contains column headers</label>
    <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Your column</th><th className="p-3">Example values</th><th className="p-3">Use as</th></tr></thead><tbody>{sheet.columns.map((field, index) => <tr key={index} className={`border-t border-slate-100 ${!field ? "bg-slate-50 text-slate-500" : ""}`}>
      <td className="max-w-52 break-words p-3"><span className="text-xs text-slate-400">{index + 1}. </span>{sheet.hasHeader ? sheet.rows[0].cells[index] || "(empty header)" : `Column ${index + 1}`}</td>
      <td className="max-w-64 break-all p-3">{examples.map(row => row.cells[index] || "(blank)").join(" · ")}</td>
      <td className="p-3"><select aria-label={`Column ${index + 1} maps to`} className="field-input min-w-56" value={field} onChange={event => onChange({ ...sheet, columns: sheet.columns.map((value, i) => i === index ? event.target.value : value) })}>{OLIGO_MAPPING_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
    </tr>)}</tbody></table></div>
    <p className="text-sm text-slate-600">{ignored} column(s) will be ignored. Missing or blank scale and purification use <strong>25 nmol</strong> and <strong>Desalted</strong>. Check these requests in the preview; the lab will confirm availability and pricing.</p>
    <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">One row is one oligo. Sequences are read 5′ to 3′. Spaces and line breaks are removed, and letters are capitalized. Put modifications in their own columns; numbers and modification codes inside sequences are rejected.</p>
    <button type="button" className="button-primary" onClick={onPreview}>Confirm mapping & preview oligos</button>
  </section>;
}
