"use client";

import { useId } from "react";
import { Field, TextField } from "./sample-editor";
import { PAYMENT_METHODS, type OrderDefaults } from "@/lib/order-defaults";
import { DropboxSelector } from "./dropbox-selector";

const deliveryOptions: { value: OrderDefaults["deliveryMethod"]; label: string; description: string }[] = [
  { value: "Dropbox", label: "Drop off at a Dropbox", description: "Choose a campus location from the list or map below." },
  { value: "Pickup", label: "Request lab pickup", description: "Enter your lab address and ask our team to collect your samples." },
  { value: "Ship to SeqForge", label: "Ship to SeqForge", description: "Send your samples by mail or courier." },
];

export function OrderDefaultFields({ value, onChange, section = "all" }: { value: OrderDefaults; onChange: (value: OrderDefaults) => void; section?: "all" | "shipping" | "payment" }) {
  const deliveryGroup = useId();
  function update(key: keyof OrderDefaults, text: string) { onChange({ ...value, [key]: text }); }
  return <div className="space-y-6">
    {section !== "payment" && <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-4 text-base font-bold">Sample delivery and contact</legend>
      <fieldset className="sm:col-span-2"><legend className="mb-3 text-sm font-semibold">How will your samples reach us?</legend>
        <div className="grid gap-3 lg:grid-cols-3">{deliveryOptions.map(option => <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-teal-600 ${value.deliveryMethod === option.value ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-400"}`}>
          <input type="radio" name={deliveryGroup} value={option.value} checked={value.deliveryMethod === option.value} onChange={() => update("deliveryMethod", option.value)} className="mt-1 h-4 w-4 shrink-0 accent-teal-700" aria-label={option.label} />
          <span><span className="block text-sm font-bold text-slate-900">{option.label}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{option.description}</span></span>
        </label>)}</div>
      </fieldset>
      {value.deliveryMethod === "Pickup" ? <>
        <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Leaving samples at a campus dropbox? <button type="button" className="font-semibold text-teal-700 underline underline-offset-2" onClick={() => update("deliveryMethod", "Dropbox")}>Choose a Dropbox location</button></div>
        <div className="sm:col-span-2"><TextField label="Lab pickup address *" hint="Institution, building, room and collection point for a pickup request. Availability is confirmed by SeqForge." value={value.pickupLocation} onChange={(v) => update("pickupLocation", v)} maxLength={500} /></div>
        <div className="sm:col-span-2"><TextField label="Pickup instructions" hint="For example: collection hours or reception instructions." value={value.pickupInstructions} onChange={(v) => update("pickupInstructions", v)} maxLength={500} /></div>
      </> : value.deliveryMethod === "Dropbox" ? <div className="sm:col-span-2"><DropboxSelector value={value} onChange={onChange} /></div> : <p className="text-sm text-slate-600 sm:col-span-2">Contact SeqForge for the delivery address and shipping instructions before sending samples.</p>}
      <TextField label="Contact name *" value={value.contactName} onChange={(v) => update("contactName", v)} maxLength={120} />
      <TextField label="Contact phone *" value={value.contactPhone} onChange={(v) => update("contactPhone", v)} maxLength={60} />
    </fieldset>}
    {section !== "shipping" && <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-4 text-base font-bold">Lab and billing</legend>
      <TextField label="PI / principal investigator" hint="The researcher who leads your lab. This does not have to be the invoice contact." value={value.piName} onChange={(v) => update("piName", v)} maxLength={120} />
      <TextField label="Billing organization *" value={value.billingOrganization} onChange={(v) => update("billingOrganization", v)} maxLength={200} />
      <TextField label="Billing contact name *" hint="Lab manager or finance contact who handles invoices." value={value.billingContactName} onChange={(v) => update("billingContactName", v)} maxLength={120} />
      <Field label="Billing email *"><input type="email" className="field-input" maxLength={254} value={value.billingEmail} onChange={(e) => update("billingEmail", e.target.value)} /></Field>
      <div className="sm:col-span-2"><Field label="Billing address *"><textarea className="field-input min-h-24" maxLength={1000} value={value.billingAddress} onChange={(e) => update("billingAddress", e.target.value)} /></Field></div>
      <Field label="Payment method"><select className="field-input" value={value.paymentMethod} onChange={(e) => update("paymentMethod", e.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}<option disabled>Credit card — not yet available</option></select></Field>
      <p className="self-center text-sm text-slate-600">Invoice / PO details are recorded for billing review. No payment is collected and no invoice is sent automatically.</p>
    </fieldset>}
  </div>;
}
