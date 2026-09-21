"use client";

import { Field, SelectField, TextField } from "./sample-editor";
import { DELIVERY_METHODS, PAYMENT_METHODS, type OrderDefaults } from "@/lib/order-defaults";

export function OrderDefaultFields({ value, onChange }: { value: OrderDefaults; onChange: (value: OrderDefaults) => void }) {
  function update(key: keyof OrderDefaults, text: string) { onChange({ ...value, [key]: text }); }
  return <div className="space-y-6">
    <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-4 text-base font-bold">Sample delivery and contact</legend>
      <SelectField label="Delivery method" value={value.deliveryMethod} options={DELIVERY_METHODS} onChange={(v) => update("deliveryMethod", v)} />
      <TextField label="Contact name *" value={value.contactName} onChange={(v) => update("contactName", v)} maxLength={120} />
      <TextField label="Contact phone *" value={value.contactPhone} onChange={(v) => update("contactPhone", v)} maxLength={60} />
      {value.deliveryMethod === "Pickup" ? <>
        <div className="sm:col-span-2"><TextField label="Pickup location *" hint="Institution, building, room and exact collection point. Pickup availability is confirmed by SeqForge." value={value.pickupLocation} onChange={(v) => update("pickupLocation", v)} maxLength={500} /></div>
        <div className="sm:col-span-2"><TextField label="Pickup instructions" hint="For example: collection hours or reception instructions." value={value.pickupInstructions} onChange={(v) => update("pickupInstructions", v)} maxLength={500} /></div>
      </> : <p className="text-sm text-slate-600 sm:col-span-2">Contact SeqForge for the delivery address and shipping instructions before sending samples.</p>}
    </fieldset>
    <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-4 text-base font-bold">Lab and billing</legend>
      <TextField label="PI / principal investigator" hint="The researcher who leads your lab. This does not have to be the invoice contact." value={value.piName} onChange={(v) => update("piName", v)} maxLength={120} />
      <TextField label="Billing organization *" value={value.billingOrganization} onChange={(v) => update("billingOrganization", v)} maxLength={200} />
      <TextField label="Billing contact name *" hint="Lab manager or finance contact who handles invoices." value={value.billingContactName} onChange={(v) => update("billingContactName", v)} maxLength={120} />
      <Field label="Billing email *"><input type="email" className="field-input" maxLength={254} value={value.billingEmail} onChange={(e) => update("billingEmail", e.target.value)} /></Field>
      <div className="sm:col-span-2"><Field label="Billing address *"><textarea className="field-input min-h-24" maxLength={1000} value={value.billingAddress} onChange={(e) => update("billingAddress", e.target.value)} /></Field></div>
      <Field label="Payment method"><select className="field-input" value={value.paymentMethod} onChange={(e) => update("paymentMethod", e.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}<option disabled>Credit card — not yet available</option></select></Field>
      <p className="self-center text-sm text-slate-600">Invoice / PO details are recorded for billing review. No payment is collected and no invoice is sent automatically.</p>
    </fieldset>
  </div>;
}
