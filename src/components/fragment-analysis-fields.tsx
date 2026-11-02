"use client";
import { FRAGMENT_RESULTS, type FragmentSettings } from "@/lib/fragment-analysis";
import { TextField, SelectField } from "@/components/sample-editor";

export function FragmentAnalysisFields({ value, onChange }: { value: FragmentSettings; onChange: (value: FragmentSettings) => void }) {
  const change = (key: keyof FragmentSettings, text: string) => onChange({ ...value, [key]: text });
  return <section className="panel space-y-4 p-5 sm:p-6" aria-label="Fragment Analysis settings">
    <div><p className="eyebrow">Analysis settings</p><h2 className="mt-1 text-xl font-bold">Fluorescently labeled PCR products</h2><p className="mt-2 text-sm text-slate-600">These settings apply to all samples in this order. Use a separate order for a different dye set or analysis method.</p></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField label="Fluorescent dyes used *" value={value.dyes} maxLength={200} onChange={text => change("dyes", text)} hint="Enter the labels used in your PCR products. Write Unknown if you need help identifying them." />
      <TextField label="Requested size standard (optional)" value={value.sizeStandard} maxLength={200} onChange={text => change("sizeStandard", text)} hint="Leave blank for the laboratory to recommend a compatible standard." />
      <TextField label="Expected fragment size — minimum (bp) *" value={value.minSize} maxLength={20} numeric onChange={text => change("minSize", text)} />
      <TextField label="Expected fragment size — maximum (bp) *" value={value.maxSize} maxLength={20} numeric onChange={text => change("maxSize", text)} />
      <SelectField label="Requested results" value={value.resultRequest} options={FRAGMENT_RESULTS} onChange={text => change("resultRequest", text)} />
    </div>
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Price pending lab confirmation. We will confirm dye compatibility, size standard, preparation and the requested analysis before you approve a quote. Submission does not start analysis.</p>
  </section>;
}
