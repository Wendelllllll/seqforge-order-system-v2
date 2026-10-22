"use client";

import { ArrowLeft, ArrowRight, Check, Circle, ClipboardPaste, Dna, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OrderDefaultFields } from "@/components/order-default-fields";
import { OrderDraftChoice } from "@/components/order-draft-choice";
import { OrderManifest } from "@/components/order-manifest";
import { OligoColumnMapper } from "@/components/oligo-column-mapper";
import { OligoGrid } from "@/components/oligo-grid";
import { Field, SelectField, TextField } from "@/components/sample-editor";
import { useOrderDraft } from "@/components/use-order-draft";
import { blankDefaults, type OrderDefaults } from "@/lib/order-defaults";
import { blankOrder, issueLabel, MAX_IMPORT_BYTES, orderSchema, type OrderDraft } from "@/lib/order-intake";
import { emailVerificationUrl, orderLoginUrl, orderReturnPath, type OrderResumeState } from "@/lib/order-resume";
import { blankOligo, inspectOligoSheet, oligoBaseCount, oligoTemplate, parseMappedOligos } from "@/lib/oligo-entry";
import type { OligoDraft } from "@/lib/oligo-schema";
import { priceOrder } from "@/lib/pricing";
import type { MappingSheet } from "@/lib/sanger-column-mapping";

export function OligoOrderForm({ userId = null, defaults = blankDefaults(), modified = false }: { userId?: string | null; defaults?: OrderDefaults; modified?: boolean }) {
  const router = useRouter();
  const mode = modified ? "Oligo modified" : "Oligo standard";
  const [draft, setDraft] = useState<OrderDraft>(() => ({ ...blankOrder(), service: "OLIGO", submissionMode: mode, samples: [], oligos: [blankOligo()], oligoShippingAddress: "", oligoFormat: "Dry", fulfillment: defaults }));
  const [step, setStep] = useState<"samples" | "details">("samples");
  const [review, setReview] = useState<OrderDraft | null>(null);
  const [entryMethod, setEntryMethod] = useState<"manual" | "paste">("manual");
  const [bulkText, setBulkText] = useState("");
  const [mappingSheet, setMappingSheet] = useState<MappingSheet | null>(null);
  const [pendingImport, setPendingImport] = useState<OligoDraft[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldIssues, setFieldIssues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountChanged, setAccountChanged] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [submissionKey, setSubmissionKey] = useState("");
  const submitting = useRef(false);
  const importRevision = useRef(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const items = draft.oligos || [];
  const enteredItems = items.filter(item => item.name.trim() || item.sequence.trim());
  const bases = oligoBaseCount(enteredItems);
  const resumeState: OrderResumeState = { draft, step, review: !!review, entryMethod, bulkText, mappingSheet, oligoPendingImport: pendingImport, pendingImport: null, submissionKey, shareText: "", pasteSource: "", imported: false, sampleCount: 1 };
  const resume = useOrderDraft(mode, userId, resumeState, saved => {
    setDraft(saved.draft); setStep(saved.review ? "details" : saved.step); setEntryMethod(saved.entryMethod === "manual" ? "manual" : "paste");
    setBulkText(saved.bulkText); setMappingSheet(saved.mappingSheet); setPendingImport(saved.oligoPendingImport || null); setSubmissionKey(saved.submissionKey);
    const parsed = orderSchema.safeParse(saved.draft);
    if (saved.review && parsed.success) setReview(parsed.data);
    setMessage("Your draft has been restored. Check your sequences and specifications before submitting.");
  });

  function invalidateImportRead() { importRevision.current++; setReadingFile(false); }
  function update<K extends keyof OrderDraft>(field: K, value: OrderDraft[K]) {
    setSubmissionKey(""); setErrors([]); setFieldIssues({}); setMessage(""); setPendingImport(null);
    setDraft(current => ({ ...current, [field]: value }));
  }
  function showErrors(messages: string[]) { setErrors(messages); requestAnimationFrame(() => alertRef.current?.focus()); }
  function validateItems(oligos: OligoDraft[], importing = false) {
    // A plain sequence list can be imported into Modified DNA and edited afterwards.
    // The order-wide modification requirement still applies before continuing.
    const plainImport = importing && modified && !oligos.some(item => item.modification5.trim() || item.modification3.trim() || item.modificationInternal.trim());
    const result = orderSchema.safeParse({ ...draft, oligos, submissionMode: plainImport ? "Oligo standard" : draft.submissionMode });
    return result.success ? [] : result.error.issues.filter(issue => issue.path[0] === "oligos");
  }
  function nextStep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingFile) { showErrors(["Wait for your file to finish reading before continuing."]); return; }
    if (pendingImport || bulkText.trim()) { showErrors(["Apply or discard your spreadsheet before continuing."]); setStep("samples"); setEntryMethod("paste"); return; }
    if (step === "samples") {
      const issues = validateItems(items);
      if (issues.length) { setFieldIssues(Object.fromEntries(issues.map(issue => [issue.path.join("."), issue.message]))); showErrors(issues.map(issueLabel)); return; }
      setStep("details"); setErrors([]);
    } else {
      const result = orderSchema.safeParse(draft);
      if (!result.success) { showErrors(result.error.issues.map(issueLabel)); return; }
      setDraft(result.data); setReview(result.data); setErrors([]);
      requestAnimationFrame(() => headingRef.current?.focus());
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function signIn(key = submissionKey) {
    if (resume.save({ ...resumeState, submissionKey: key })) window.location.assign(orderLoginUrl(mode));
  }
  async function submitOrder() {
    if (!review || submitting.current || accountChanged) return;
    if (readingFile || pendingImport || bulkText.trim()) { setReview(null); setStep("samples"); setEntryMethod("paste"); showErrors(["Finish applying or discard your spreadsheet before submitting."]); return; }
    if (!userId) { signIn(); return; }
    submitting.current = true; setLoading(true); setErrors([]);
    const key = submissionKey || crypto.randomUUID(); setSubmissionKey(key);
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, "X-Pricing-Customer-Id": userId }, body: JSON.stringify(review) });
      if (response.status === 401) { signIn(key); return; }
      const payload = await response.json();
      if (response.status === 403 && payload.code === "EMAIL_NOT_VERIFIED") {
        if (resume.save({ ...resumeState, submissionKey: key })) window.location.assign(emailVerificationUrl(orderReturnPath(mode)));
        return;
      }
      if (response.status === 409 && payload.code === "ACCOUNT_CHANGED") {
        setAccountChanged(true);
        showErrors(["The signed-in account changed in another tab. Reload to use that account's own draft, or sign back in to the account that started this order. This draft remains saved for its original account."]);
        return;
      }
      if (!response.ok) { showErrors(Array.isArray(payload.issues) ? payload.issues : [payload.error || "Unable to submit your order."]); return; }
      resume.clear(); router.push(`/orders/${payload.id}?submitted=1`); router.refresh();
    } catch { showErrors(["The connection was interrupted. Your entries are still here. Retry without editing to safely check the same submission."]); }
    finally { submitting.current = false; setLoading(false); }
  }
  function prepareMapping(text = bulkText) {
    invalidateImportRead();
    setPendingImport(null); setImportErrors([]);
    try { setMappingSheet(inspectOligoSheet(text)); }
    catch (error) { setMappingSheet(null); setImportErrors([error instanceof Error ? error.message : "Unable to read your spreadsheet."]); }
  }
  function previewImport() {
    if (!mappingSheet || readingFile) return;
    const result = parseMappedOligos(mappingSheet);
    const issues = result.errors.length ? result.errors : validateItems(result.oligos, true).map(issueLabel);
    setImportErrors(issues); setPendingImport(issues.length ? null : result.oligos);
  }
  async function readFile(file?: File) {
    if (!file) return;
    invalidateImportRead();
    const revision = importRevision.current;
    setImportErrors([]);
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { setImportErrors(["Upload CSV, TSV, or TXT. For Excel workbooks, copy the cells and paste them here."]); return; }
    if (file.size > MAX_IMPORT_BYTES) { setImportErrors(["The file is larger than 1 MB."]); return; }
    setReadingFile(true);
    try {
      const text = await file.text(); if (revision !== importRevision.current) return;
      const sheet = inspectOligoSheet(text);
      setBulkText(text); setMappingSheet(sheet); setPendingImport(null);
    } catch (error) { if (revision === importRevision.current) setImportErrors([error instanceof Error ? error.message : "Unable to read this file. Your previous spreadsheet is still here."]); }
    finally { if (revision === importRevision.current) setReadingFile(false); }
  }
  function discardImport() { invalidateImportRead(); setBulkText(""); setMappingSheet(null); setPendingImport(null); setImportErrors([]); }
  function applyImport(append: boolean) {
    if (!pendingImport || readingFile) return;
    const oligos = append ? [...items, ...pendingImport] : pendingImport;
    const issues = validateItems(oligos, true);
    if (issues.length) { setImportErrors(issues.map(issueLabel)); return; }
    update("oligos", oligos); discardImport(); setEntryMethod("manual"); setMessage("Spreadsheet applied. You can edit every oligo below.");
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([oligoTemplate()], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "seqforge-oligo-template.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const notice = <><p className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">{!userId && "Prepare your order as a guest. Sign in or create an account at the final step. "}{resume.storageError ? "Draft saving is unavailable." : "Your draft is saved in this browser for 30 days after your latest edit. Come back to this oligo type to continue."}</p>{resume.storageError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{resume.storageError}</p>}</>;
  const errorPanel = errors.length ? <div role="alert" ref={alertRef} tabIndex={-1} className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">Please check these details</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div> : null;

  if (!resume.ready) return <p role="status" className="panel p-6 text-sm">Preparing your order…</p>;
  if (resume.pendingDraft) return <OrderDraftChoice saved={resume.pendingDraft} onContinue={resume.continueDraft} onRestart={resume.startFresh} error={resume.storageError} />;
  if (review) return <div className="space-y-6">
    {notice}<h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold">Review your Oligo order</h2>
    <p className="text-sm text-slate-600">Check each sequence in the 5′ to 3′ direction, requested specifications and shipping address. Submission requests a quote; production starts only after you approve it.</p>
    <OrderManifest order={{ ...review, oligoSnapshot: { items: review.oligos, shippingAddress: review.oligoShippingAddress, format: review.oligoFormat }, fulfillmentSnapshot: review.fulfillment, pricingSnapshot: priceOrder(review) }} />
    {errorPanel}{accountChanged && <button type="button" className="button-secondary" onClick={() => window.location.reload()}>Reload for current account</button>}<div className="flex flex-wrap justify-end gap-3"><button type="button" className="button-secondary" disabled={loading} onClick={() => { setReview(null); setStep("samples"); setErrors([]); }}>Edit oligos</button><button type="button" className="button-secondary" disabled={loading} onClick={() => { setReview(null); setErrors([]); }}>Edit delivery & billing</button><button type="button" className="button-primary" disabled={loading || accountChanged} onClick={submitOrder}>{loading && <LoaderCircle size={16} className="animate-spin" />}{userId ? "Submit for price confirmation" : "Sign in to submit order"}</button></div>
  </div>;

  return <form noValidate method="post" onSubmit={nextStep} className="sanger-order-form space-y-6">
    {notice}
    <div className="sanger-order-summary"><div><span className="eyebrow">Oligo synthesis</span><h2>{modified ? "Modified DNA oligos" : "Standard DNA oligos"}</h2><p>One row per oligo. Enter your DNA sequence 5′ → 3′{modified ? ", with modifications in their own fields" : ""}. Requested scale, purification and availability are confirmed by the lab.</p></div><div className="sanger-counts" aria-live="polite"><strong><b className="sanger-count-value" key={`o${enteredItems.length}`}>{enteredItems.length}</b><span>oligos</span></strong><strong><b className="sanger-count-value" key={`b${bases}`}>{bases.toLocaleString()}</b><span>total bases</span></strong></div></div>
    <div className="sanger-flow-layout"><div className="sanger-flow-main space-y-6">
      <div className="sanger-stage"><span aria-current={step === "samples" ? "step" : undefined}>1. Oligos & specifications</span><span aria-current={step === "details" ? "step" : undefined}>2. Delivery & billing</span><span>3. Review</span></div>
      {errorPanel}
      {step === "samples" ? <>
        <section className="panel space-y-4 p-5 sm:p-6"><TextField label="Order name (optional)" hint="For your own reference. Your submitted order receives a unique order number." maxLength={120} value={draft.orderName} onChange={value => update("orderName", value)} /><p className="text-sm text-slate-500">DNA only. Spaces and line breaks in sequences are removed, and letters become uppercase. Put modification names and positions in the separate modification fields.</p></section>
        <section className="panel overflow-hidden">
          <div className="sanger-entry-heading"><div><p className="eyebrow">Your oligo table</p><h2>Sequences & specifications</h2></div><div className="flex flex-wrap gap-2" aria-label="Oligo entry method"><button type="button" className={entryMethod === "manual" ? "button-primary" : "button-secondary"} onClick={() => setEntryMethod("manual")}>Enter oligos</button><button type="button" className={entryMethod === "paste" ? "button-primary" : "button-secondary"} onClick={() => setEntryMethod("paste")}><ClipboardPaste size={16} /> Paste / upload</button></div></div>
          {entryMethod === "paste" && <div className="sanger-paste space-y-4">
            <p>Copy cells from Excel or upload a CSV. Confirm your columns and ignore any extras before applying.</p>
            <Field label="Excel cells"><textarea className="field-input min-h-36 font-mono" maxLength={MAX_IMPORT_BYTES} value={bulkText} onChange={event => { invalidateImportRead(); setBulkText(event.target.value); setMappingSheet(null); setPendingImport(null); setImportErrors([]); }} placeholder={"Name\tSequence\nPrimer-F\tACGTTGCAACGTTGCAACGT\nPrimer-R\tTGCACGATTGCACGATTGCA"} /></Field>
            <div className="flex flex-wrap gap-3"><button type="button" className="button-primary" disabled={readingFile || !bulkText.trim()} onClick={() => prepareMapping()}>Match columns</button><button type="button" className="button-secondary" onClick={discardImport}>Discard paste</button></div>
            <div className="flex flex-wrap items-center gap-3"><Field label="Upload CSV / TSV"><input type="file" accept=".csv,.tsv,.txt" className="max-w-full text-sm" onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ""; }} /></Field><button type="button" className="button-secondary" onClick={downloadTemplate}>Download CSV template</button></div>
            {readingFile && <p role="status" className="text-sm text-teal-800">Reading your file…</p>}{mappingSheet && <OligoColumnMapper sheet={mappingSheet} onChange={sheet => { invalidateImportRead(); setMappingSheet(sheet); setPendingImport(null); setImportErrors([]); }} onPreview={previewImport} />}
            {importErrors.length > 0 && <ul role="alert" className="max-h-48 list-disc overflow-auto rounded-lg bg-red-50 p-4 pl-8 text-sm text-red-800">{importErrors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
            {pendingImport && <div className="sanger-paste-preview"><strong>{pendingImport.length} oligos · {oligoBaseCount(pendingImport).toLocaleString()} bases</strong><p className="mt-2 text-sm">Check the preview before replacing or adding to your table.</p><ul className="my-3 max-h-48 space-y-2 overflow-auto text-sm">{pendingImport.map((item, i) => <li key={i}><strong>{item.name}</strong> · {item.sequence.length} bases · {item.synthesisScale} · {item.purification}<p className="break-all font-mono text-xs">5′–{item.sequence}–3′</p>{[item.modification5 && `5′: ${item.modification5}`, item.modification3 && `3′: ${item.modification3}`, item.modificationInternal && `Internal: ${item.modificationInternal}`].filter(Boolean).join(" · ")}</li>)}</ul><div className="flex flex-wrap gap-3"><button type="button" className="button-primary" onClick={() => applyImport(false)}>Replace oligo table</button>{enteredItems.length > 0 && <button type="button" className="button-secondary" onClick={() => applyImport(true)}>Append to oligo table</button>}</div></div>}
          </div>}
          {message && <p role="status" className="px-6 py-3 text-sm text-emerald-800">{message}</p>}
          <OligoGrid items={items} modified={modified} issues={fieldIssues} onChange={oligos => update("oligos", oligos)} />
          <p className="px-6 pb-5 text-xs text-slate-500">Up to 250 oligos per order. Complete or remove every row before continuing. Counts reflect your current table; they do not include unapplied spreadsheet data.</p>
        </section>
      </> : <>
        <section className="panel space-y-5 p-5 sm:p-6"><div><p className="eyebrow">Delivery</p><h2 className="mt-2 text-xl font-bold">Where should your oligos go?</h2><p className="mt-2 text-sm text-slate-500">You are ordering synthesis from sequences. No DNA samples need to be sent in.</p></div>
          <div className="grid gap-4 sm:grid-cols-2"><TextField label="Contact name *" maxLength={120} value={draft.fulfillment.contactName} onChange={contactName => update("fulfillment", { ...draft.fulfillment, contactName })} /><TextField label="Contact phone *" maxLength={60} value={draft.fulfillment.contactPhone} onChange={contactPhone => update("fulfillment", { ...draft.fulfillment, contactPhone })} /></div>
          <Field label="Shipping address *" hint="Recipient, institution / company, street, building / room, city, state, postal code and country."><textarea className="field-input min-h-28" maxLength={1000} value={draft.oligoShippingAddress || ""} onChange={event => update("oligoShippingAddress", event.target.value)} /></Field>
          <SelectField label="Requested delivery form" options={["Dry", "Resuspended"]} value={draft.oligoFormat || "Dry"} onChange={value => update("oligoFormat", value as "Dry" | "Resuspended")} />
          <p className="text-sm text-slate-500">Delivery form, packaging, shipping cost and turnaround will be confirmed with your quote.{draft.oligoFormat === "Resuspended" && " Include your requested buffer and concentration in the instructions below, if known."}</p>
        </section>
        <section className="panel space-y-5 p-5 sm:p-6"><p className="eyebrow">Billing</p><OrderDefaultFields section="payment" value={draft.fulfillment} onChange={value => update("fulfillment", value)} /><TextField label={draft.fulfillment.paymentMethod === "Purchase order" ? "PO number *" : "PO number (optional)"} maxLength={80} value={draft.poNumber} onChange={value => update("poNumber", value)} /><p className="text-sm text-slate-500">The lab will use the billing email and contact phone to follow up on your quote. No payment is collected here.</p></section>
        <section className="panel space-y-4 p-5 sm:p-6"><Field label="Special instructions (optional)" hint="For example, requested buffer / concentration, packaging, or a date you are working toward. Requests need lab confirmation."><textarea className="field-input min-h-24" maxLength={2000} value={draft.specialInstructions} onChange={event => update("specialInstructions", event.target.value)} /></Field></section>
      </>}
      <div className="flex flex-wrap justify-between gap-3"><button type="button" className="button-secondary" onClick={() => { if (step === "details") { setStep("samples"); setErrors([]); } else router.push("/orders/new?service=oligo"); }}><ArrowLeft size={16} />{step === "details" ? "Back to oligos" : "Back to Oligo options"}</button><button type="submit" disabled={readingFile} className="button-primary">{step === "samples" ? "Continue to delivery & billing" : "Review order"}<ArrowRight size={16} /></button></div>
    </div>
    <aside className="sanger-live-summary" aria-label="Live order summary"><div className="sanger-live-heading"><span className="eyebrow">Your order</span><Dna size={25} strokeWidth={1.5} /></div><h2>Oligo synthesis <span>{modified ? "Modified DNA" : "Standard DNA"}</span></h2>
      <div className="sanger-live-counts" aria-live="polite"><div><strong>{enteredItems.length}</strong><span>oligos</span></div><div><strong>{bases.toLocaleString()}</strong><span>total bases</span></div></div>
      <ol className="sanger-live-progress"><li data-active={step === "samples"}>{step === "details" ? <Check size={16} /> : <Circle size={16} />}<span>Oligos & specifications<small>{bulkText.trim() ? "Apply your spreadsheet" : "Build your sequence list"}</small></span></li><li data-active={step === "details"}><Circle size={16} /><span>Delivery & billing<small>Where to send your oligos</small></span></li><li><Circle size={16} /><span>Review & submit<small>Request your lab quote</small></span></li></ol>
      <div className="sanger-live-price"><p>Price pending lab confirmation</p><small>We’ll review sequences, synthesis scale, purification and modifications. Production starts only after you approve the quote.</small></div>
      {bulkText.trim() && <p className="sanger-import-note" role="status">Spreadsheet not applied yet. Counts reflect your oligo table.</p>}
    </aside></div>
  </form>;
}
