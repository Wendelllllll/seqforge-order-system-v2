"use client";

import { PREPARATIONS, PROTOCOLS, type OrderDraft, type SampleDraft } from "@/lib/order-intake";
import { useState } from "react";
import { formatMoney } from "@/lib/pricing";
import type { AddOn, RateSchedule } from "@/lib/rate-schedule";

type ServiceGroup = {
  title: string;
  scope: AddOn["scope"];
  items: AddOn[];
  selected: string[];
  request?: string;
  emptyRequest?: string;
  requestOptions?: readonly string[];
  onChange: (ids: string[], request?: string) => void;
};

function groupSelection(group: ServiceGroup) {
  const priced = group.items.filter(item => group.selected.includes(item.id) || (!!item.trigger && item.trigger === group.request));
  const unavailable = group.selected.filter(id => !group.items.some(item => item.id === id));
  const quoted = !!group.request && group.request !== group.emptyRequest && !priced.some(item => item.trigger === group.request);
  return { priced, unavailable, quoted, count: priced.length + unavailable.length + Number(quoted), cents: priced.reduce((sum, item) => sum + (item.unitCents ?? 0), 0) };
}

function ServiceChoices({ group, catalog, prefix, customerIds = [] }: { group: ServiceGroup; catalog: AddOn[]; prefix: string; customerIds?: string[] }) {
  const { unavailable } = groupSelection(group);
  const pricedRequest = group.items.find(item => item.trigger && item.trigger === group.request);
  const quoteOptions = (group.requestOptions || []).filter(value => value !== group.emptyRequest && !group.items.some(item => item.trigger === value));
  if (group.request && group.request !== group.emptyRequest && !pricedRequest && !quoteOptions.includes(group.request)) quoteOptions.push(group.request);
  if (!group.items.length && !unavailable.length && !quoteOptions.length) return null;
  return <fieldset className="space-y-2 border-t border-slate-200 pt-3 first:border-0 first:pt-0">
    <legend className="mb-2 text-xs font-semibold text-slate-800">{group.title}</legend>
    {group.items.map(item => {
      const automatic = !!item.trigger && item.trigger === group.request;
      return <label key={item.id} className="flex cursor-pointer items-start gap-2 text-xs leading-5">
        <input type="checkbox" className="mt-1 h-3.5 w-3.5 shrink-0 accent-teal-700" aria-label={`${prefix} ${group.title}: ${item.name}`} checked={automatic || group.selected.includes(item.id)} onChange={event => group.onChange(event.target.checked ? [...new Set([...group.selected, item.id])] : group.selected.filter(id => id !== item.id), !event.target.checked && automatic ? group.emptyRequest : group.request)} />
        <span className="min-w-0"><span className="block font-medium">{item.name}</span><span className="text-slate-500">+{formatMoney(item.unitCents)} / {group.scope}</span>{customerIds.includes(item.id) && <span className="block text-[11px] font-semibold text-teal-800">Customer price</span>}</span>
      </label>;
    })}
    {quoteOptions.length > 0 && <label className="block text-xs text-slate-600">Other request · quote required
      <select className="field-input mt-1" aria-label={`${prefix} ${group.title}: other request`} value={pricedRequest ? group.emptyRequest : group.request} onChange={event => {
        // A legacy priced request may already be stored in preparation/protocol.
        // Keep that service selected when adding an independent quote request.
        const ids = pricedRequest ? [...new Set([...group.selected, pricedRequest.id])] : group.selected;
        group.onChange(ids, event.target.value);
      }}>
        <option value={group.emptyRequest}>None</option>
        {quoteOptions.map(value => <option key={value} value={value}>{value.replace(/ requested$/, "")}</option>)}
      </select>
    </label>}
    {unavailable.map(id => <div key={id} role="alert" className="rounded-md bg-amber-50 p-2 text-xs text-amber-950"><span>{catalog.find(item => item.id === id)?.name || "Saved service"} is unavailable for this item.</span> <button type="button" className="font-semibold underline" onClick={() => group.onChange(group.selected.filter(value => value !== id), group.request)}>Remove</button></div>)}
  </fieldset>;
}

export function SangerSampleServices({ sample, index, mode, schedule, onChange, orderAddOnIds, onOrderAddOnsChange }: {
  sample: SampleDraft; index: number; mode: OrderDraft["submissionMode"]; schedule: RateSchedule;
  onChange: (sample: SampleDraft) => void; orderAddOnIds?: string[]; onOrderAddOnsChange?: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const catalog = schedule.addOns || [];
  const standard = mode === "Standard";
  const preparations = standard ? PREPARATIONS.filter(value => value === "None requested" || (value === "Miniprep requested" ? sample.templateType === "Plasmid DNA" : ["PCR product", "Purified PCR product"].includes(sample.templateType))) : ["None requested"];
  const active = catalog.filter(item => item.active && item.unitCents !== null && item.service === "SANGER" && (!item.trigger?.endsWith("requested") || preparations.includes(item.trigger as SampleDraft["preparation"])));
  const groups: ServiceGroup[] = [];
  if (index === 0 && onOrderAddOnsChange) groups.push({ title: "Entire order", scope: "order", items: active.filter(item => item.scope === "order"), selected: orderAddOnIds || [], onChange: ids => onOrderAddOnsChange(ids) });
  groups.push({ title: "This sample", scope: "sample", items: active.filter(item => item.scope === "sample"), selected: sample.addOnIds || [], request: sample.preparation, emptyRequest: "None requested", requestOptions: preparations, onChange: (addOnIds, preparation) => onChange({ ...sample, addOnIds, preparation: preparation as SampleDraft["preparation"] }) });
  sample.reactions.forEach((reaction, reactionIndex) => groups.push({
    title: `Reaction ${reactionIndex + 1}${reaction.primerName && reaction.primerName !== "Included in mix" ? ` · ${reaction.primerName}` : ""}`,
    scope: "reaction", items: active.filter(item => item.scope === "reaction"), selected: reaction.addOnIds || [], request: reaction.specialProtocol, emptyRequest: "None known", requestOptions: PROTOCOLS,
    onChange: (addOnIds, specialProtocol) => onChange({ ...sample, reactions: sample.reactions.map((item, i) => i === reactionIndex ? { ...item, addOnIds, specialProtocol: specialProtocol as typeof item.specialProtocol } : item) }),
  }));
  const selected = groups.map(groupSelection);
  const count = selected.reduce((sum, group) => sum + group.count, 0);
  const cents = selected.reduce((sum, group) => sum + group.cents, 0);
  const quoted = selected.some(group => group.quoted);
  const unavailable = selected.some(group => group.unavailable.length);
  const preparationInvalid = sample.preparation !== "None requested" && !preparations.includes(sample.preparation);
  return <details className="group" aria-label={`Sample ${index + 1} additional services`} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-teal-800 hover:border-teal-500">
      {count ? `${count} selected` : "Select"}
      {count > 0 && <span className="mt-1 block text-[11px] font-normal text-slate-500">{cents ? `+${formatMoney(cents)}` : ""}{quoted ? `${cents ? " · " : ""}Quote requested` : ""}{unavailable || preparationInvalid ? " · Review needed" : ""}</span>}
    </summary>
    {open && <div className="mt-2 max-h-96 space-y-4 overflow-y-auto rounded-md border border-slate-200 bg-white p-3">
      {groups.map(group => <ServiceChoices key={group.title} group={group} catalog={catalog} prefix={`Sample ${index + 1}`} customerIds={schedule.overriddenAddOnIds} />)}
      {preparationInvalid && <p role="alert" className="text-xs text-amber-900">The saved preparation does not match this DNA type or submission format. Clear it under “This sample” or update the DNA type.</p>}
      <p className="text-[11px] leading-4 text-slate-500">Reaction treatments apply to sequencing, not primer synthesis.</p>
    </div>}
  </details>;
}
