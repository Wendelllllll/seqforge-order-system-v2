"use client";

import { ArrowLeft, ArrowRight, ClipboardPaste, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useOrderDraft } from "@/components/use-order-draft";
import { OrderDraftChoice } from "@/components/order-draft-choice";
import { PlasmidSampleGrid } from "@/components/plasmid-sample-grid";
import { newPlasmidSample, parseMappedPlasmid, plasmidTemplate } from "@/lib/whole-plasmid";
import { orderLoginUrl, type OrderResumeState } from "@/lib/order-resume";
import { SangerOrderSummary } from "@/components/sanger-order-summary";
import { formatMoney, priceOrder } from "@/lib/pricing";
import { DEFAULT_SCHEDULE, plasmidRateFor, RATE_ITEMS, rateScheduleSchema, type RateSchedule } from "@/lib/rate-schedule";
import { OrderManifest } from "@/components/order-manifest";
import { Field, SelectField, TextField } from "@/components/sample-editor";
import { SangerSampleGrid } from "@/components/sanger-sample-grid";
import { blankOrder, CONTAINERS, issueLabel, MAX_IMPORT_BYTES, MAX_REACTIONS, orderSchema, PRIORITIES, reactionCount, type OrderDraft, type SampleDraft } from "@/lib/order-intake";
import { appendSangerSamples, newSangerSample, verticalWell } from "@/lib/sanger-entry";
import { SangerColumnMapper } from "@/components/sanger-column-mapper";
import { inspectSangerSheet, parseMappedSanger, type MappingSheet, type MappingSource } from "@/lib/sanger-column-mapping";
import { simpleOrderTemplate } from "@/lib/simple-order-template";
import { OrderDefaultFields } from "@/components/order-default-fields";
import { saveOrderDefaults } from "@/components/account-defaults-form";
import { blankDefaults, type OrderDefaults } from "@/lib/order-defaults";

export function OrderForm({ userId = null, defaults = blankDefaults(), initialSubmissionMode = "Standard", initialSchedule }: { userId?: string | null; defaults?: OrderDefaults; initialSubmissionMode?: OrderDraft["submissionMode"]; initialSchedule: RateSchedule }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [priceNotice, setPriceNotice] = useState("");
  const [draft, setDraft] = useState<OrderDraft>(() => ({ ...blankOrder(), service: initialSubmissionMode === "Whole plasmid" ? "WHOLE_PLASMID" : "SANGER", submissionMode: initialSubmissionMode, fulfillment: defaults, samples: [initialSubmissionMode === "Whole plasmid" ? newPlasmidSample([], "Tubes") : newSangerSample([], "Tubes", initialSubmissionMode)] }));
  const [step, setStep] = useState<"samples" | "details">("samples");
  const [entryMethod, setEntryMethod] = useState("manual");
  const [shareText, setShareText] = useState("");
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsMessage, setDefaultsMessage] = useState("");
  const [defaultsError, setDefaultsError] = useState("");
  const [review, setReview] = useState<OrderDraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldIssues, setFieldIssues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const importRevision = useRef(0);
  const [submissionKey, setSubmissionKey] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [pasteSource, setPasteSource] = useState<MappingSource>("");
  const [mappingSheet, setMappingSheet] = useState<MappingSheet | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<SampleDraft[] | null>(null);
  const [message, setMessage] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const standard = draft.submissionMode === "Standard";
  const readyToLoad = draft.submissionMode === "Ready to load";
  const wholePlasmid = draft.service === "WHOLE_PLASMID";
  const sampleStage = wholePlasmid ? "Plasmid samples" : readyToLoad ? "Prepared reactions" : "Samples & primers";
  const namedSamples = draft.samples.filter(sample => sample.sampleName.trim());
  const count = namedSamples.length;
  const reactions = reactionCount(namedSamples);

  const resumeState: OrderResumeState = {
    draft, shareText, entryMethod: entryMethod as OrderResumeState["entryMethod"], bulkText, pendingImport,
    review: !!review, submissionKey, pricingSchedule: schedule, priceNotice,
    step, mappingSheet, pasteSource, imported: false, sampleCount: 1,
  };
  const resume = useOrderDraft(initialSubmissionMode, userId, resumeState, saved => {
    // Older Ready to load drafts retained CSV text even after applying it.
    const oldImport = saved.entryMethod === "import";
    const previousSchedule = saved.pricingSchedule || DEFAULT_SCHEDULE;
    const changed = previousSchedule.revision !== initialSchedule.revision || RATE_ITEMS.some(item => previousSchedule.rates[item.key] !== initialSchedule.rates[item.key]);
    setPriceNotice(changed ? `The price schedule changed since this draft was saved. ${saved.draft.service === "WHOLE_PLASMID" ? "Whole Plasmid prices depend on expected size. " : ""}Review the updated rates and total before submitting.` : saved.priceNotice || "");
    setSchedule(initialSchedule);
    setDraft(saved.draft); setShareText(saved.shareText); setEntryMethod(oldImport ? saved.imported ? "manual" : "paste" : saved.entryMethod); setBulkText(oldImport && saved.imported ? "" : saved.bulkText);
    setPendingImport(oldImport && saved.imported ? null : saved.pendingImport); setSubmissionKey(saved.submissionKey);
    setStep(saved.review ? "details" : saved.step); setMappingSheet(saved.mappingSheet); setPasteSource(saved.pasteSource);
    const checked = orderSchema.safeParse(saved.draft);
    if (saved.review && checked.success) setReview(checked.data);
    setMessage("Your draft has been restored. Check the details before submitting.");
  });
  function signInToContinue(key = submissionKey) {
    if (resume.save({ ...resumeState, submissionKey: key })) window.location.assign(orderLoginUrl(initialSubmissionMode));
  }
  const draftNotice = <><p className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">{!userId && <>You can prepare this order as a guest. Sign in or create an account at the final step. </>}{resume.storageError ? "Draft saving is unavailable." : "Drafts are saved automatically in this browser for 30 days after your latest edit. You can close this page and return to this submission type to continue."}</p>{resume.storageError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{resume.storageError}</p>}</>;

  function update<K extends keyof OrderDraft>(field: K, value: OrderDraft[K]) {
    importRevision.current++;
    setSubmissionKey("");
    setDraft(current => ({ ...current, [field]: value }));
    setPendingImport(null);
    setMessage("");
    setErrors([]);
    setFieldIssues({});
  }
  function showErrors(items: string[]) { setErrors(items); requestAnimationFrame(() => alertRef.current?.focus()); }
  function validateSamples(samples: SampleDraft[]) {
    const result = orderSchema.safeParse({ ...draft, samples });
    const issues = result.success ? [] : result.error.issues.filter(issue => issue.path[0] === "samples");
    return issues;
  }
  function reviewOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "samples") {
      if (pendingImport || bulkText.trim()) { showErrors(["Apply or discard your pasted spreadsheet before continuing."]); return; }
      const issues = validateSamples(draft.samples);
      if (issues.length) { setFieldIssues(Object.fromEntries(issues.map(issue => [issue.path.join("."), `${issue.path[2] === "reactions" && typeof issue.path[3] === "number" ? `Primer ${issue.path[3] + 1}: ` : ""}${issue.message}`]))); showErrors(["Check the highlighted sample rows before continuing."]); return; }
      setStep("details"); setErrors([]); window.scrollTo({ top: 0, behavior: "smooth" }); return;
    }
    const parsed = orderSchema.safeParse({ ...draft, sharedResultEmails: shareText.split(/[\s,;]+/).filter(Boolean) });
    if (!parsed.success) { showErrors(parsed.error.issues.map(issueLabel)); return; }
    setDraft(parsed.data); setReview(parsed.data); setErrors([]);
    requestAnimationFrame(() => headingRef.current?.focus());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submitOrder() {
    if (!review || submitting.current || priceNotice) return;
    if (!userId) { signInToContinue(); return; }
    submitting.current = true; const key = submissionKey || crypto.randomUUID(); setSubmissionKey(key); setLoading(true); setErrors([]);
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, "X-Pricing-Revision": String(schedule.revision) }, body: JSON.stringify(review) });
      if (response.status === 401) { signInToContinue(key); return; }
      const payload = await response.json();
      if (response.status === 409 && payload.code === "PRICE_CHANGED") {
        const latest = rateScheduleSchema.parse(payload.schedule);
        const before = priceOrder(review, schedule); const after = priceOrder(review, latest);
        setSchedule(latest);
        setPriceNotice(`The price schedule was updated. Your sequencing total was ${formatMoney(before.subtotalCents)} and is now ${formatMoney(after.subtotalCents)}. Review and confirm the current price before submitting. No order has been created.`);
        return;
      }
      if (!response.ok) { showErrors(Array.isArray(payload.issues) ? payload.issues : [payload.error || "Unable to submit the order."]); return; }
      resume.clear();
      router.push(`/orders/${payload.id}?submitted=1`); router.refresh();
    } catch { showErrors(["The connection was interrupted. Your entries remain here. Check order history before retrying."]); }
    finally { setLoading(false); submitting.current = false; }
  }
  function prepareMapping(text = bulkText) {
    setPendingImport(null); setPasteSource(""); setImportErrors([]);
    try { setMappingSheet(inspectSangerSheet(text, draft.container)); }
    catch (error) { setMappingSheet(null); setImportErrors([error instanceof Error ? error.message : "Unable to read the spreadsheet."]); }
  }
  function previewImport() {
    if (!mappingSheet) return;
    const result = wholePlasmid ? parseMappedPlasmid(mappingSheet, draft) : parseMappedSanger(mappingSheet, draft, pasteSource);
    setImportErrors(result.errors); setPendingImport(result.errors.length ? null : result.samples);
  }
  async function readFile(file?: File) {
    const revision = ++importRevision.current;
    setPendingImport(null); setMappingSheet(null); setPasteSource(""); setBulkText(""); setImportErrors([]);
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { setImportErrors(["Upload CSV, TSV, or TXT. For Excel, copy the cells and paste below."]); return; }
    if (file.size > MAX_IMPORT_BYTES) { setImportErrors(["The import is larger than 1 MB."]); return; }
    try { const text = await file.text(); if (revision !== importRevision.current) return; setBulkText(text); prepareMapping(text); }
    catch { if (revision === importRevision.current) setImportErrors(["Unable to read this file. Try copying and pasting its cells."]); }
  }
  function applyImport(append: boolean) {
    if (!pendingImport) return;
    const samples = append ? appendSangerSamples(draft.samples, pendingImport) : pendingImport;
    const issues = validateSamples(samples);
    if (issues.length) { setImportErrors(issues.map(issueLabel)); return; }
    update("samples", samples); setBulkText(""); setMappingSheet(null); setPasteSource(""); setEntryMethod("manual"); setImportErrors([]); setMessage(wholePlasmid ? "Spreadsheet applied. You can edit every plasmid sample below." : "Spreadsheet applied. You can edit every sample and primer below.");
  }
  function changeContainer(container: OrderDraft["container"]) {
    importRevision.current++; setSubmissionKey("");
    setDraft(current => ({ ...current, container, samples: current.samples.map((sample, index) => ({ ...sample, tubeLabel: sample.tubeLabel || `Tube-${index + 1}`, plateLabel: sample.plateLabel || `Plate-${Math.floor(index / 96) + 1}`, well: sample.well || verticalWell(index) })) }));
    setPendingImport(null); setErrors([]); setFieldIssues({});
    setMessage("Format changed. Check the physical labels and well positions before continuing.");
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([wholePlasmid ? plasmidTemplate(draft.container) : simpleOrderTemplate(draft.container, 8, draft.submissionMode)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `seqforge-${wholePlasmid ? "whole-plasmid-" : ""}${draft.container.toLowerCase()}-template.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const errorPanel = errors.length ? <div ref={alertRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">Please check these details</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null;
  const summary = <div className="sanger-order-summary"><div><span className="eyebrow">{wholePlasmid ? "Whole Plasmid Sequencing" : "Sanger sequencing"}</span><h2>{wholePlasmid ? "Purified plasmid DNA" : draft.submissionMode}</h2><p>{wholePlasmid ? `One plasmid sample per tube or occupied well. ≤12 kb: ${formatMoney(plasmidRateFor(draft.container, false, schedule))}; >12 kb: ${formatMoney(plasmidRateFor(draft.container, true, schedule))} per sample. No sequencing primers required.` : standard ? "DNA and primers supplied separately. Add one reaction for each primer." : readyToLoad ? "Send completed sequencing reactions, ready for loading. One tube or occupied well is one reaction." : "DNA + one primer in each tube or well. Send separate mixes for additional primers."}</p></div><div className="sanger-counts" aria-live="polite"><strong><b className="sanger-count-value" key={count}>{count}</b><span>{draft.container === "Plate" ? "occupied wells" : wholePlasmid ? "sample tubes" : readyToLoad ? "reaction tubes" : "DNA / mix tubes"}</span></strong>{!wholePlasmid && <strong><b className="sanger-count-value" key={reactions}>{reactions}</b><span>reactions</span></strong>}</div></div>;

  if (!resume.ready) return <p role="status" className="panel p-6 text-sm">Preparing your order…</p>;
  if (resume.pendingDraft) return <OrderDraftChoice saved={resume.pendingDraft} onContinue={resume.continueDraft} onRestart={resume.startFresh} error={resume.storageError} />;

  if (review) return <div className="space-y-6">
    {draftNotice}
    <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold">Review your order</h2>
    <p className="text-sm text-slate-600">{wholePlasmid ? "Check your plasmid names, physical labels and sample count." : "Check your physical labels, sample count and reaction count."} The order is saved only when you confirm below.</p>
    <OrderManifest order={{ ...review, fulfillmentSnapshot: { ...review.fulfillment, sharedResultEmails: review.sharedResultEmails }, pricingSnapshot: priceOrder(review, schedule) }} />
    {priceNotice && <div role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><p className="font-bold">Please confirm the updated price</p><p>{priceNotice}</p><label className="flex items-center gap-3"><input type="checkbox" checked={false} onChange={() => setPriceNotice("")} />I have reviewed and accept the updated sequencing price.</label></div>}
    {errorPanel}<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={loading} onClick={() => { setReview(null); setStep("samples"); setErrors([]); }} className="button-secondary">Back to edit samples</button><button type="button" disabled={loading} onClick={() => { setReview(null); setErrors([]); }} className="button-secondary">Edit delivery & billing</button><button type="button" disabled={loading || !!priceNotice} onClick={submitOrder} className="button-primary">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{userId ? "Confirm and submit order" : "Sign in to submit order"}</button></div>
  </div>;

  return <form method="post" noValidate onSubmit={reviewOrder} className="sanger-order-form space-y-6">
    {draftNotice}
    {summary}
    <div className="sanger-flow-layout"><div className="sanger-flow-main space-y-6" key={step}>
    <div className="sanger-stage"><span aria-current={step === "samples" ? "step" : undefined}>1. {sampleStage}</span><span aria-current={step === "details" ? "step" : undefined}>2. Delivery & billing</span><span>3. Review</span></div>
    {errorPanel}
    {step === "samples" ? <>
      <section className="panel space-y-5 p-5 sm:p-6">
        <div className="grid gap-6 md:grid-cols-2"><TextField label="Order name (optional)" hint="For your own reference. Each order receives a unique order number." value={draft.orderName} onChange={value => update("orderName", value)} maxLength={120} /><fieldset><legend className="field-label mb-2">Sample format</legend><div className="flex gap-3">{CONTAINERS.map(container => <label key={container} className={`sanger-format ${draft.container === container ? "selected" : ""}`}><input type="radio" name="container" checked={draft.container === container} onChange={() => changeContainer(container)} /> {container === "Plate" ? "96-well plates" : "Tubes / 8-tube strips"}</label>)}</div></fieldset></div>
        <p className="text-sm text-slate-500">{draft.container === "Plate" ? "New wells run A1 → H1, then A2 → H2. Explicit imported well positions are preserved." : "Match tube labels to your physical samples. Sample names identify your results."} {wholePlasmid ? "Submit purified plasmid DNA. Enter expected size in base pairs (12 kb = 12,000 bp) to calculate the correct price. Size and concentration may be left blank if unknown; missing sizes use a base estimate until the lab confirms size and price." : readyToLoad ? "These must be completed sequencing reactions. Primer names and original DNA details are optional records; add preparation information in the notes." : "Length and concentration may be left blank if unknown; lab review may be needed."}</p>
      </section>
      <section className="panel overflow-hidden">
        <div className="sanger-entry-heading"><div><p className="eyebrow">Your sample table</p><h2>{sampleStage}</h2></div><div className="flex flex-wrap gap-2" aria-label="Sample entry method"><button type="button" className={entryMethod === "manual" ? "button-primary" : "button-secondary"} onClick={() => setEntryMethod("manual")}>Enter samples</button><button type="button" className={entryMethod === "paste" ? "button-primary" : "button-secondary"} onClick={() => setEntryMethod("paste")}><ClipboardPaste size={16} /> Paste from Excel</button></div></div>
        {entryMethod === "paste" && <div className="sanger-paste space-y-4">
          <p>Copy cells from Excel and paste below. No file conversion needed.</p>
          <p className="text-sm text-slate-600">CSV uploads and pasted cells both use column confirmation. Match your columns and ignore extras. {wholePlasmid ? "Each row is one plasmid sample. No primer columns are needed." : standard ? "Confirm primer source. Separate multiple primer names with semicolons." : readyToLoad ? "Confirm the sequencing reactions are ready for loading. Each row is one tube or occupied well; primer names are optional." : "Confirm DNA and primer are mixed. Each row is one pre-mixed tube or well; primer names are optional."}</p>
          <Field label="Excel cells"><textarea className="field-input min-h-36 font-mono" value={bulkText} onChange={e => { importRevision.current++; setBulkText(e.target.value); setMappingSheet(null); setPasteSource(""); setPendingImport(null); setImportErrors([]); }} placeholder={wholePlasmid ? "Sample name\tTube label\tLength (bp)\tConcentration\nPlasmid-1\tTube-1\t5000\t100" : readyToLoad ? "Sample name\tTube label\tPrimer\nReaction-1\tTube-1\tT7" : "Sample name\tLength (bp)\tConcentration\tPrimer\nClone-1\t3200\t100\tT7"} /></Field>
          <div className="flex flex-wrap gap-3"><button type="button" className="button-primary" disabled={!bulkText.trim()} onClick={() => prepareMapping()}>Match columns</button><button type="button" className="button-secondary" onClick={() => { importRevision.current++; setBulkText(""); setMappingSheet(null); setPasteSource(""); setPendingImport(null); setImportErrors([]); }}>Discard paste</button></div>
          <details><summary className="cursor-pointer text-sm font-semibold">Upload CSV / TSV instead</summary><div className="mt-3 flex flex-wrap items-center gap-4"><input aria-label="Upload sample file" type="file" accept=".csv,.tsv,.txt" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ""; }} /><button type="button" className="button-secondary" onClick={downloadTemplate}>Download blank CSV template</button></div></details>
          {mappingSheet && <SangerColumnMapper sheet={mappingSheet} source={pasteSource} container={draft.container} standard={standard} readyToLoad={readyToLoad} wholePlasmid={wholePlasmid} onChange={sheet => { importRevision.current++; setMappingSheet(sheet); setPendingImport(null); setImportErrors([]); }} onSourceChange={source => { importRevision.current++; setPasteSource(source); setPendingImport(null); setImportErrors([]); }} onPreview={previewImport} />}
          {importErrors.length > 0 && <ul role="alert" className="max-h-48 list-disc overflow-auto rounded-lg bg-red-50 p-4 pl-8 text-sm text-red-800">{importErrors.map((error, i) => <li key={i}>{error}</li>)}</ul>}
          {pendingImport && <div className="sanger-paste-preview"><strong>{pendingImport.length} samples{!wholePlasmid && <> · {reactionCount(pendingImport)} reactions</>}</strong><p className="mt-2 text-sm">Check generated labels against your tubes or plate. Applying replaces or appends exactly as selected below.</p><ul className="my-3 max-h-44 overflow-auto text-sm">{pendingImport.map(sample => <li key={sample.sampleKey}>{draft.container === "Plate" ? `${sample.plateLabel} / ${sample.well}` : sample.tubeLabel} · {sample.sampleName} · {wholePlasmid ? `${sample.templateLength || "Unknown"} bp · ${sample.concentration || "Unknown"} ng/µL` : readyToLoad ? `Completed reaction · Primer: ${sample.reactions[0].primerName === "Included in mix" ? "not specified" : sample.reactions[0].primerName}` : <>{sample.reactions.map(r => `${r.primerName} (${r.primerSource})`).join("; ")} · {sample.templateLength || "Unknown"} bp · {sample.concentration || "Unknown"} ng/µL</>}</li>)}</ul><div className="flex flex-wrap gap-3"><button type="button" className="button-primary" onClick={() => applyImport(false)}>Replace sample table</button>{draft.samples.length > 0 && <button type="button" className="button-secondary" onClick={() => applyImport(true)}>Append to sample table</button>}</div></div>}
        </div>}
        {message && <p role="status" className="px-6 py-3 text-sm text-emerald-800">{message}</p>}
        {wholePlasmid ? <PlasmidSampleGrid samples={draft.samples} container={draft.container} issues={fieldIssues} onChange={samples => update("samples", samples)} /> : <SangerSampleGrid samples={draft.samples} mode={draft.submissionMode} container={draft.container} issues={fieldIssues} onChange={samples => update("samples", samples)} />}
        <p className="px-6 pb-5 text-xs text-slate-500">Counts update as samples are named. All rows must be complete or removed before continuing. Maximum {MAX_REACTIONS} {wholePlasmid ? "samples" : "reactions"}.</p>
      </section>
    </> : <>
    <section className="panel space-y-5 p-5 sm:p-6"><p className="eyebrow">Delivery</p><OrderDefaultFields section="shipping" value={draft.fulfillment} onChange={value => update("fulfillment", value)} /></section>
    <section className="panel space-y-5 p-5 sm:p-6"><p className="eyebrow">Billing</p><OrderDefaultFields section="payment" value={draft.fulfillment} onChange={value => update("fulfillment", value)} />
      <TextField label={draft.fulfillment.paymentMethod === "Purchase order" ? "PO number *" : "PO number (optional)"} required={draft.fulfillment.paymentMethod === "Purchase order"} value={draft.poNumber} onChange={v => update("poNumber", v)} maxLength={80} />
      <button type="button" className="button-secondary" disabled={savingDefaults || !userId} onClick={async () => { setSavingDefaults(true); setDefaultsMessage(""); setDefaultsError(""); try { await saveOrderDefaults(draft.fulfillment); setDefaultsMessage("Saved for future orders."); } catch (error) { setDefaultsError(error instanceof Error ? error.message : "Unable to save defaults."); } finally { setSavingDefaults(false); } }}>{savingDefaults ? "Saving…" : "Remember shipping and billing details"}</button>
      {defaultsMessage && <p role="status" className="text-sm text-emerald-700">{defaultsMessage}</p>}{defaultsError && <p role="alert" className="text-sm text-red-700">{defaultsError}</p>}
    </section>
    <section className="panel space-y-5 p-5 sm:p-6"><div><p className="eyebrow">Results & additional requests</p><h2 className="mt-2 text-xl font-bold">Keep your team in the loop.</h2></div><Field label="Recipient emails (optional)" hint="Separate emails with commas or new lines. Saved for lab follow-up; automatic email delivery and shared account access are not available yet."><textarea className="field-input" value={shareText} maxLength={5200} onChange={e => { setShareText(e.target.value); setSubmissionKey(""); }} placeholder="colleague@lab.edu" /></Field>
      <details><summary className="cursor-pointer text-sm font-semibold">Additional requests</summary><div className="mt-4 space-y-4"><SelectField label="Priority requested" value={draft.priority} options={PRIORITIES} onChange={v => update("priority", v as OrderDraft["priority"])} /><Field label="Special instructions"><textarea className="field-input min-h-24" maxLength={2000} value={draft.specialInstructions} onChange={e => update("specialInstructions", e.target.value)} /></Field></div></details>
    </section>
    </>}
    <div className="flex flex-wrap justify-between gap-3"><button type="button" className="button-secondary" onClick={() => { if (step === "details") { setStep("samples"); setErrors([]); } else router.push(wholePlasmid ? "/orders/new" : "/orders/new?service=sanger"); }}><ArrowLeft size={16} /> {step === "details" ? "Back to samples" : wholePlasmid ? "Back to services" : "Back to Sanger options"}</button><button type="submit" className="button-primary">{step === "samples" ? "Continue to delivery & billing" : "Review order"}<ArrowRight size={16} /></button></div>
    </div><SangerOrderSummary schedule={schedule} draft={draft} step={step} hasPendingImport={!!bulkText.trim()} /></div>
  </form>;
}
