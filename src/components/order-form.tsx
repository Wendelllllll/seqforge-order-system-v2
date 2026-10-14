"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OrderPricing } from "@/components/order-pricing";
import { priceOrder } from "@/lib/pricing";
import { OrderManifest } from "@/components/order-manifest";
import { Field, SelectField, TextField } from "@/components/sample-editor";
import { blankOrder, CONTAINERS, issueLabel, MAX_IMPORT_BYTES, MAX_REACTIONS, MODES, orderSchema, PRIORITIES, reactionCount, type OrderDraft, type SampleDraft } from "@/lib/order-intake";
import { simpleOrderTemplate } from "@/lib/simple-order-template";
import { importSamples } from "@/lib/order-import";

import { OrderDefaultFields } from "@/components/order-default-fields";
import { saveOrderDefaults } from "@/components/account-defaults-form";
import { blankDefaults, type OrderDefaults } from "@/lib/order-defaults";

export function OrderForm({ defaults = blankDefaults() }: { defaults?: OrderDefaults }) {
  const router = useRouter();
  const [sampleCount, setSampleCount] = useState(1);
  const [imported, setImported] = useState(false);
  const [entryMethod, setEntryMethod] = useState("import");
  const [shareText, setShareText] = useState("");
  const [draft, setDraft] = useState<OrderDraft>(() => ({ ...blankOrder(), fulfillment: defaults }));
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState("");
  const [defaultsError, setDefaultsError] = useState("");
  const [review, setReview] = useState<OrderDraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const importRevision = useRef(0);
  const submissionKey = useRef("");
  const [bulkText, setBulkText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<SampleDraft[] | null>(null);
  const [message, setMessage] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);


  function update<K extends keyof OrderDraft>(field: K, value: OrderDraft[K]) {
    importRevision.current++;
    if (field === "container" || field === "submissionMode") { setImported(false); setImportErrors([]); }
    submissionKey.current = "";
    setDraft((current) => ({ ...current, [field]: value }));
    setPendingImport(null);
    setMessage("");
  }
  function showErrors(items: string[]) {
    setErrors(items);
    requestAnimationFrame(() => alertRef.current?.focus());
  }
  function reviewOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entryMethod !== "import" || !imported) { showErrors(["Import your sample spreadsheet before reviewing the order."]); return; }
    if (draft.samples.length !== sampleCount) { showErrors([`You selected ${sampleCount} samples, but imported ${draft.samples.length}. Update the quantity or your spreadsheet.`]); return; }
    const parsed = orderSchema.safeParse({ ...draft, sharedResultEmails: shareText.split(/[\s,;]+/).filter(Boolean) });
    if (!parsed.success) { showErrors(parsed.error.issues.map(issueLabel)); return; }
    setDraft(parsed.data);
    setReview(parsed.data);
    setErrors([]);
    requestAnimationFrame(() => headingRef.current?.focus());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submitOrder() {
    if (!review || submitting.current) return;
    submitting.current = true;
    submissionKey.current ||= crypto.randomUUID();
    setLoading(true);
    setErrors([]);
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submissionKey.current }, body: JSON.stringify(review),
      });
      const payload = await response.json();
      if (!response.ok) {
        showErrors(Array.isArray(payload.issues) ? payload.issues : [payload.error || "Unable to submit the order."]);
        return;
      }
      router.push(`/orders/${payload.id}?submitted=1`);
      router.refresh();
    } catch { showErrors(["The connection was interrupted. Check your order history before retrying; your entries remain available here."]); }
    finally { setLoading(false); submitting.current = false; }
  }
  async function readFile(file?: File) {
    const revision = ++importRevision.current;
    setPendingImport(null);
    setImportErrors([]);
    if (!file) return;
    setImported(false);
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { setImportErrors(["Choose a .csv, .tsv, or .txt file."]); return; }
    if (file.size > MAX_IMPORT_BYTES) { setImportErrors(["The import is larger than 1 MB."]); return; }
    try {
      const text = await file.text();
      if (revision !== importRevision.current) return;
      setBulkText(text);
      const result = importSamples(text, draft);
      setImportErrors(result.errors);
      setPendingImport(result.errors.length ? null : result.samples);
    }
    catch { if (revision !== importRevision.current) return; setImportErrors(["Unable to read this file. You can paste its contents below instead."]); }
  }
  function previewImport() {
    importRevision.current++;
    setImported(false);
    const result = importSamples(bulkText, draft);
    setImportErrors(result.errors);
    setPendingImport(result.errors.length ? null : result.samples);
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([simpleOrderTemplate(draft.container, sampleCount)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `seqforge-${draft.container.toLowerCase()}-template.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const errorPanel = errors.length ? <div ref={alertRef} tabIndex={-1} role="alert" className="border-l-2 border-red-500 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">Please check these details</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null;

  if (review) return <div className="space-y-6">
    <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold">Review your order</h2>
    <p className="text-sm text-slate-600">Check the labels on your physical samples against this manifest. Your order is saved only after you confirm below.</p>
    <OrderManifest order={{ ...review, fulfillmentSnapshot: { ...review.fulfillment, sharedResultEmails: review.sharedResultEmails }, pricingSnapshot: priceOrder(review) }} />
    {errorPanel}
    <div className="flex flex-wrap justify-end gap-3">
      <button type="button" disabled={loading} onClick={() => { setReview(null); setErrors([]); }} className="button-secondary">Back to edit</button>
      <button type="button" disabled={loading} onClick={submitOrder} className="button-primary">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Confirm and submit order</button>
    </div>
  </div>;

  return <form method="post" onSubmit={reviewOrder} className="space-y-6">
    <section className="panel space-y-6 p-5 sm:p-6">
      <div><p className="eyebrow">01 / Your samples</p><h2 className="mt-2 text-2xl font-bold">Let’s start with Sanger.</h2></div>
      <TextField label="Order name (optional)" hint="Leave blank for Untitled order. Names can be reused; each order gets its own order number." value={draft.orderName} onChange={v => update("orderName", v)} maxLength={120} />
      <fieldset><legend className="mb-3 text-sm font-bold">Submission type</legend><div className="grid gap-3 sm:grid-cols-3">{MODES.map((mode, i) => <label key={mode} className={`cursor-pointer rounded-xl border-2 p-4 ${draft.submissionMode === mode ? "border-cyan-700 bg-cyan-50" : "border-slate-200"}`}>
        <input type="radio" name="mode" checked={draft.submissionMode === mode} onChange={() => update("submissionMode", mode)} className="mr-2" /><strong>{mode}</strong><p className="mt-2 text-sm text-slate-600">{["DNA and primers supplied separately.", "DNA and primer already mixed.", "Prepared reactions, ready for loading."][i]}</p>
      </label>)}</div></fieldset>
      <fieldset><legend className="mb-3 text-sm font-bold">Sample format</legend><div className="grid gap-3 sm:grid-cols-2">{CONTAINERS.map(container => <label key={container} className={`cursor-pointer rounded-xl border-2 p-4 ${draft.container === container ? "border-cyan-700 bg-cyan-50" : "border-slate-200"}`}><input type="radio" name="container" checked={draft.container === container} onChange={() => update("container", container)} className="mr-2" /><strong>{container === "Plate" ? "96-well plate" : "Individual tubes"}</strong></label>)}</div></fieldset>
      <Field label="How many physical samples?" hint={draft.container === "Plate" ? "Count occupied wells. Template wells run A1–A12, then B1–B12; a new plate starts after 96 samples." : "Count physical tubes. Multiple primers can be entered as separate rows for the same sample."}><input type="number" className="field-input max-w-40" min={1} max={MAX_REACTIONS} step={1} required value={Number.isNaN(sampleCount) ? "" : sampleCount} onChange={e => { setSampleCount(e.target.valueAsNumber); submissionKey.current = ""; }} /></Field>
    </section>

    <section className="panel space-y-5 p-5 sm:p-6">
      <div><p className="eyebrow">02 / Sample details</p><h2 className="mt-2 text-xl font-bold">Bring your spreadsheet.</h2></div>
      <div className="flex flex-wrap gap-3" aria-label="Sample entry method">{["import", "manual"].map(method => <button key={method} type="button" aria-pressed={entryMethod === method} className={entryMethod === method ? "button-primary" : "button-secondary"} onClick={() => setEntryMethod(method)}>{method === "import" ? "Import spreadsheet" : "Manual · coming soon"}</button>)}</div>
      {entryMethod === "manual" ? <p role="status" className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">Manual entry is coming soon. Choose Import spreadsheet to continue with this order.</p> : <>
        <p className="text-sm text-slate-600">Download one template, fill it in, then upload. Existing SeqForge CSV and TXT files work too. Save Excel sheets as CSV before uploading.</p>
        <button type="button" className="button-secondary" disabled={!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > MAX_REACTIONS} onClick={downloadTemplate}>Download CSV template</button>
        <p className="text-sm text-slate-500">Fill in DNA Name and check the physical labels and DNA Type. {draft.submissionMode === "Standard" ? "Enter your primer in My primers or SeqForge Primers, using only one of these columns per row." : "Use one row per tube or well. Primers are recorded as included in the prepared mix."} Up to 250 reactions, 1 MB per file.</p>
        <div className="rounded-xl border-2 border-dashed border-cyan-200 bg-cyan-50/50 p-6"><Field label="Upload your spreadsheet"><input type="file" accept=".csv,.tsv,.txt" className="block max-w-full text-sm" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ""; }} /></Field></div>
        <details className="text-sm"><summary className="cursor-pointer font-semibold text-slate-600">Paste spreadsheet rows instead</summary><div className="mt-4 space-y-4">
          <Field label="Paste rows including headers"><textarea className="field-input min-h-32 font-mono" value={bulkText} onChange={e => { importRevision.current++; setImported(false); setBulkText(e.target.value); setPendingImport(null); }} /></Field><button type="button" className="button-secondary" disabled={!bulkText.trim()} onClick={previewImport}>Validate spreadsheet</button>
        </div></details>
        {importErrors.length > 0 && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">Please check your spreadsheet</p><ul className="max-h-60 list-disc overflow-auto pl-5">{importErrors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
        {pendingImport && <div className="space-y-3 rounded-xl bg-cyan-50 p-4"><p className="font-semibold">{pendingImport.length} samples · {reactionCount(pendingImport)} reactions</p>{pendingImport.length !== sampleCount && <p role="alert" className="text-sm text-red-700">Expected {sampleCount} samples. Change the quantity above or correct your file.</p>}<details><summary className="cursor-pointer text-sm">Preview sample names and labels</summary><ul className="mt-2 max-h-48 overflow-auto text-sm">{pendingImport.map(sample => <li key={sample.sampleKey}>{draft.container === "Plate" ? `${sample.plateLabel} / ${sample.well}` : sample.tubeLabel} — {sample.sampleName} · {sample.reactions.map(r => r.primerName).join(", ")}</li>)}</ul></details><button type="button" className="button-primary" disabled={pendingImport.length !== sampleCount} onClick={() => { update("samples", pendingImport); setImported(true); setMessage(`${pendingImport.length} samples imported. Complete shipping and payment below, then select Review order.`); }}>Use these samples</button></div>}
        {imported && <p role="status" className="text-sm font-semibold text-emerald-700">{message || `${draft.samples.length} samples imported.`}</p>}
        {!imported && draft.samples[0]?.sampleName && <p className="text-sm text-amber-700">Submission type or format changed. Validate and import your spreadsheet again.</p>}
      </>}
    </section>
    <section className="panel space-y-5 p-5 sm:p-6"><p className="eyebrow">03 / Shipping</p><OrderDefaultFields section="shipping" value={draft.fulfillment} onChange={value => update("fulfillment", value)} /></section>
    <section className="panel space-y-5 p-5 sm:p-6"><p className="eyebrow">04 / Payment</p><OrderDefaultFields section="payment" value={draft.fulfillment} onChange={value => update("fulfillment", value)} />
      <TextField label={draft.fulfillment.paymentMethod === "Purchase order" ? "PO number *" : "PO number (optional)"} required={draft.fulfillment.paymentMethod === "Purchase order"} value={draft.poNumber} onChange={v => update("poNumber", v)} maxLength={80} />
      <button type="button" className="button-secondary" disabled={savingDefaults} onClick={async () => { setSavingDefaults(true); setDefaultsMessage(""); setDefaultsError(""); try { await saveOrderDefaults(draft.fulfillment); setDefaultsMessage("Saved for future orders."); } catch (error) { setDefaultsError(error instanceof Error ? error.message : "Unable to save defaults."); } finally { setSavingDefaults(false); } }}>{savingDefaults ? "Saving…" : "Remember shipping and billing details"}</button>
      {defaultsMessage && <p role="status" className="text-sm text-emerald-700">{defaultsMessage}</p>}{defaultsError && <p role="alert" className="text-sm text-red-700">{defaultsError}</p>}
    </section>
    <section className="panel space-y-5 p-5 sm:p-6"><div><p className="eyebrow">05 / Share results</p><h2 className="mt-2 text-xl font-bold">Keep your team in the loop.</h2></div><Field label="Recipient emails (optional)" hint="Separate emails with commas or new lines. Saved for lab follow-up; automatic email delivery and shared account access are not available yet."><textarea className="field-input" value={shareText} maxLength={5200} onChange={e => { setShareText(e.target.value); submissionKey.current = ""; }} placeholder="colleague@lab.edu" /></Field>
      <details><summary className="cursor-pointer text-sm font-semibold">Additional requests</summary><div className="mt-4 space-y-4"><SelectField label="Priority requested" value={draft.priority} options={PRIORITIES} onChange={v => update("priority", v as OrderDraft["priority"])} /><Field label="Special instructions"><textarea className="field-input min-h-24" maxLength={2000} value={draft.specialInstructions} onChange={e => update("specialInstructions", e.target.value)} /></Field></div></details>
    </section>
    {errorPanel}
    {imported && <OrderPricing snapshot={priceOrder(draft)} />}
    <div className="flex justify-end gap-3"><button type="button" onClick={() => router.back()} className="button-secondary">Cancel</button><button type="submit" className="button-primary" disabled={entryMethod !== "import"}>Review order</button></div>
  </form>;
}
