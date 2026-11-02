"use client";

import { formatMoney } from "@/lib/pricing";
import { PREPARATIONS, PROTOCOLS, type OrderDraft, type SampleDraft } from "@/lib/order-intake";
import type { AddOn, RateSchedule } from "@/lib/rate-schedule";

function allowed(item: AddOn, draft: OrderDraft, sample?: SampleDraft) {
  if (!item.active || item.unitCents === null || item.service !== draft.service) return false;
  if (item.trigger === "PCR cleanup requested") return draft.submissionMode === "Standard" && !!sample && ["PCR product", "Purified PCR product"].includes(sample.templateType);
  if (item.trigger === "Miniprep requested") return draft.submissionMode === "Standard" && sample?.templateType === "Plasmid DNA";
  return true;
}

function Choices({ title, items, selected = [], request, onChange, catalog, customerIds = [] }: { title: string; items: AddOn[]; selected?: string[]; request?: string; onChange: (ids: string[]) => void; catalog: AddOn[]; customerIds?: string[] }) {
  const unavailable = selected.filter(id => !items.some(item => item.id === id));
  // Represent the current request once while keeping other linked treatments
  // selectable, including combinations such as GC-rich plus PolyA.
  const choices = items.filter(item => !item.trigger || item.trigger !== request);
  if (!choices.length && !unavailable.length) return null;
  return <fieldset className="space-y-2 rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">{title}</legend>
    {choices.map(item => {
      return <label key={item.id} className="flex items-start justify-between gap-3 rounded-lg p-2 text-sm hover:bg-slate-50"><span className="flex items-start gap-3"><input className="mt-1 h-4 w-4 accent-teal-700" type="checkbox" checked={selected.includes(item.id)} onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} /><span>{item.name}{customerIds.includes(item.id) && <small className="block font-semibold text-teal-800">Customer price</small>}{item.trigger && selected.includes(item.id) && <small className="block text-slate-500">Additional treatment selected. Uncheck to remove it.</small>}</span></span><strong className="whitespace-nowrap">+{formatMoney(item.unitCents)} / {item.scope}</strong></label>;
    })}
    {unavailable.map(id => <div key={id} role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><span>{catalog.find(item => item.id === id)?.name || "Previously selected service"} is no longer available for this item.</span><button type="button" className="font-semibold underline" onClick={() => onChange(selected.filter(value => value !== id))}>Remove selection</button></div>)}
  </fieldset>;
}

function RequestSelect({ label, help, value, options, items, scope, disabledOptions = [], onChange }: { label: string; help: string; value: string; options: readonly string[]; items: AddOn[]; scope: "sample" | "reaction"; disabledOptions?: string[]; onChange: (value: string) => void }) {
  const selected = items.find(item => item.trigger === value);
  const hasRequest = !["None requested", "None known"].includes(value);
  return <div className="space-y-2">
    <label className="block text-sm font-semibold text-slate-900">{label}<select className="field-input mt-2" value={value} onChange={event => onChange(event.target.value)}>{options.map(option => {
      const priced = items.find(item => item.trigger === option);
      const label = ["None requested", "None known"].includes(option) ? "None requested" : `${option.replace(/ requested$/, "")}${priced ? ` — ${priced.name}, +${formatMoney(priced.unitCents)} / ${scope}` : " — quote required"}`;
      return <option key={option} value={option} disabled={disabledOptions.includes(option)}>{label}</option>;
    })}</select></label>
    <p className="text-xs leading-5 text-slate-500">{help}</p>
    {hasRequest && <p className={`rounded-lg px-3 py-2 text-sm ${disabledOptions.includes(value) ? "bg-amber-50 text-amber-950" : "bg-teal-50 text-teal-950"}`} role={disabledOptions.includes(value) ? "alert" : "status"}>{disabledOptions.includes(value) ? "This preparation does not match the DNA type or submission format. Change the request or update the sample above." : selected ? `${selected.name}: +${formatMoney(selected.unitCents)} for this ${scope}, included once in your estimate.` : "The lab will confirm availability and any additional price before processing."}</p>}
  </div>;
}

function withoutRequestSelection(ids: string[] | undefined, request: string, catalog: AddOn[]) {
  return ids?.filter(id => catalog.find(item => item.id === id)?.trigger !== request);
}

export function OrderAddOns({ draft, schedule, onChange }: { draft: OrderDraft; schedule: RateSchedule; onChange: (draft: OrderDraft) => void }) {
  const catalog = schedule.addOns || [];
  const sanger = draft.service === "SANGER";
  const standard = draft.submissionMode === "Standard";
  const hasSelections = !!draft.addOnIds?.length || draft.samples.some(sample => sample.addOnIds?.length || sample.reactions.some(reaction => reaction.addOnIds?.length));
  const hasServices = catalog.some(item => item.active && item.unitCents !== null && item.service === draft.service);
  if (!hasSelections && !hasServices) return null;
  const setSample = (index: number, sample: SampleDraft) => onChange({ ...draft, samples: draft.samples.map((item, i) => i === index ? sample : item) });
  return <section id="additional-services" aria-labelledby="additional-services-title" className="panel scroll-mt-24 space-y-5 p-5 sm:p-6"><div><p className="eyebrow">Optional processing</p><h2 id="additional-services-title" className="mt-2 text-xl font-bold">{sanger ? "Additional services & special treatment" : "Additional services"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{sanger ? "Request sample preparation or special sequencing here. Choose only what each sample or reaction needs; priced services are included in your estimate." : "Select only the samples or orders that need extra processing. Each listed charge is included in your order estimate."}</p></div>
    <Choices title="This order" items={catalog.filter(item => item.scope === "order" && allowed(item, draft))} selected={draft.addOnIds} catalog={catalog} customerIds={schedule.overriddenAddOnIds} onChange={addOnIds => onChange({ ...draft, addOnIds })} />
    {!sanger && !hasServices && !hasSelections && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No optional services are currently offered for this order type.</p>}
    {sanger && !draft.samples.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Add a sample above to choose its preparation and sequencing treatments.</p>}
    {draft.samples.map((sample, index) => {
      const location = draft.container === "Plate" ? `${sample.plateLabel} ${sample.well}`.trim() : sample.tubeLabel;
      const title = `${sample.sampleName || `Sample ${index + 1}`}${location ? ` · ${location}` : ""}`;
      const sampleItems = catalog.filter(item => item.scope === "sample" && allowed(item, draft, sample));
      const reactionItems = catalog.filter(item => item.scope === "reaction" && allowed(item, draft, sample));
      if (!sanger && !sampleItems.length && !sample.addOnIds?.length && !sample.reactions.some(reaction => reaction.addOnIds?.length)) return null;
      const disabledPreparations = PREPARATIONS.filter(option => option !== "None requested" && (!standard || (option === "Miniprep requested" ? sample.templateType !== "Plasmid DNA" : !["PCR product", "Purified PCR product"].includes(sample.templateType))));
      return <div key={sample.sampleKey || index} className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">{title}</h3><span className="text-xs text-slate-500">{sample.templateType}</span></div>
        {sanger && (standard || sample.preparation !== "None requested") && <RequestSelect label="Sample preparation" help="Charged once per sample, even when that DNA sample has several sequencing reactions. PCR cleanup requires a PCR DNA type; miniprep requires Plasmid DNA." value={sample.preparation} options={PREPARATIONS} items={sampleItems} scope="sample" disabledOptions={disabledPreparations} onChange={value => setSample(index, { ...sample, preparation: value as SampleDraft["preparation"], addOnIds: withoutRequestSelection(sample.addOnIds, sample.preparation, catalog) })} />}
        <Choices title="Extra services for this sample" items={sampleItems} selected={sample.addOnIds} request={sample.preparation} catalog={catalog} customerIds={schedule.overriddenAddOnIds} onChange={addOnIds => setSample(index, { ...sample, addOnIds })} />
        {sample.reactions.map((reaction, reactionIndex) => <div key={reactionIndex} className="space-y-3 border-t border-slate-200 pt-4"><h4 className="text-sm font-semibold">Reaction {reactionIndex + 1}{reaction.primerName && reaction.primerName !== "Included in mix" ? ` · ${reaction.primerName}` : ""}</h4>
          {sanger && <RequestSelect label="Special sequencing treatment" help="Applies to this sequencing reaction, not to primer synthesis. Choose a treatment for each reaction that needs it." value={reaction.specialProtocol} options={PROTOCOLS} items={reactionItems} scope="reaction" onChange={value => setSample(index, { ...sample, reactions: sample.reactions.map((item, i) => i === reactionIndex ? { ...item, specialProtocol: value as typeof reaction.specialProtocol, addOnIds: withoutRequestSelection(item.addOnIds, item.specialProtocol, catalog) } : item) })} />}
          <Choices title="Extra services for this reaction" items={reactionItems} selected={reaction.addOnIds} request={reaction.specialProtocol} catalog={catalog} customerIds={schedule.overriddenAddOnIds} onChange={addOnIds => setSample(index, { ...sample, addOnIds })} />
        </div>)}
      </div>;
    })}
  </section>;
}
