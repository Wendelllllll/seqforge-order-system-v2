"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PlateBuilder } from "@/components/plate-builder";
import { OrderPricing } from "@/components/order-pricing";
import { priceOrder } from "@/lib/pricing";
import { OrderManifest } from "@/components/order-manifest";
import { Field, SampleEditor, SelectField, TextField } from "@/components/sample-editor";
import { blankOrder, blankSample, CONTAINERS, issueLabel, MAX_IMPORT_BYTES, MAX_REACTIONS, MODES, orderSchema, PRIORITIES, reactionCount, type OrderDraft, type SampleDraft } from "@/lib/order-intake";
import type { LegacyPrimerChoice } from "@/lib/legacy-order-import";
import { importSamples, templateCsv } from "@/lib/order-import";

import { OrderDefaultFields } from "@/components/order-default-fields";
import { saveOrderDefaults } from "@/components/account-defaults-form";
import { blankDefaults, type OrderDefaults } from "@/lib/order-defaults";

export function OrderForm({ defaults = blankDefaults() }: { defaults?: OrderDefaults }) {
  const router = useRouter();
  const [expandedSample, setExpandedSample] = useState<number | null>(null);
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
  const [legacyPrimerChoice, setLegacyPrimerChoice] = useState<LegacyPrimerChoice>("require-single");
  const [bulkText, setBulkText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<SampleDraft[] | null>(null);
  const [message, setMessage] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const count = reactionCount(draft.samples);

  function update<K extends keyof OrderDraft>(field: K, value: OrderDraft[K]) {
    importRevision.current++;
    submissionKey.current = "";
    setDraft((current) => ({ ...current, [field]: value }));
    setPendingImport(null);
    setMessage("");
  }
  function showErrors(items: string[]) {
    setErrors(items);
    requestAnimationFrame(() => alertRef.current?.focus());
  }
  function addSample() {
    let n = draft.samples.length + 1;
    while (draft.samples.some((sample) => sample.sampleKey.toLowerCase() === `s${n}`)) n++;
    const sample = blankSample(`S${n}`);
    if (draft.submissionMode !== "Standard") sample.reactions[0].primerSource = "Included in mix";
    update("samples", [...draft.samples, sample]);
  }
  function reviewOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = orderSchema.safeParse(draft);
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
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { setImportErrors(["Choose a .csv, .tsv, or .txt file."]); return; }
    if (file.size > MAX_IMPORT_BYTES) { setImportErrors(["The import is larger than 1 MB."]); return; }
    try {
      const text = await file.text();
      if (revision !== importRevision.current) return;
      setBulkText(text);
      const result = importSamples(text, draft, legacyPrimerChoice);
      setImportErrors(result.errors);
      setPendingImport(result.errors.length ? null : result.samples);
    }
    catch { setImportErrors(["Unable to read this file. You can paste its contents below instead."]); }
  }
  function previewImport() {
    const result = importSamples(bulkText, draft, legacyPrimerChoice);
    setImportErrors(result.errors);
    setPendingImport(result.errors.length ? null : result.samples);
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv(draft.container, draft.submissionMode)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `seqforge-${draft.container.toLowerCase()}-template.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const errorPanel = errors.length ? <div ref={alertRef} tabIndex={-1} role="alert" className="border-l-2 border-red-500 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">Please check these details</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : null;

  if (review) return <div className="space-y-6">
    <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold">Review your order</h2>
    <p className="text-sm text-slate-600">Check the labels on your physical samples against this manifest. Your order is saved only after you confirm below.</p>
    <OrderManifest order={{ ...review, fulfillmentSnapshot: review.fulfillment, pricingSnapshot: priceOrder(review) }} />
    {errorPanel}
    <div className="flex flex-wrap justify-end gap-3">
      <button type="button" disabled={loading} onClick={() => { setReview(null); setErrors([]); }} className="button-secondary">Back to edit</button>
      <button type="button" disabled={loading} onClick={submitOrder} className="button-primary">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Confirm and submit order</button>
    </div>
  </div>;

  return <form method="post" onSubmit={reviewOrder} className="space-y-6">
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Step 1</p><h2 className="mt-1 text-lg font-bold">Project and service</h2></div><span className="service-chip">Sanger sequencing · V4</span></div>
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <TextField label="Order name / reference *" hint="Use a unique name for each order in your account, such as project + date + batch." value={draft.orderName} onChange={(v) => update("orderName", v)} required maxLength={120} />
        <TextField label={draft.fulfillment.paymentMethod === "Purchase order" ? "PO number *" : "PO number (optional)"} required={draft.fulfillment.paymentMethod === "Purchase order"} value={draft.poNumber} onChange={(v) => update("poNumber", v)} maxLength={80} />
        <SelectField label="Priority requested" value={draft.priority} options={PRIORITIES} onChange={(v) => update("priority", v as OrderDraft["priority"])} />
        <fieldset className="sm:col-span-2"><legend className="mb-3 text-sm font-bold">How are you submitting your samples?</legend>
          <div className="grid gap-3 sm:grid-cols-2">{CONTAINERS.map((container) => <label key={container} className={`cursor-pointer rounded-lg border-2 p-4 ${draft.container === container ? "border-cyan-700 bg-cyan-50" : "border-slate-200"}`}>
            <input type="radio" name="container" value={container} checked={draft.container === container} onChange={() => update("container", container)} className="mr-3" />
            <strong>{container === "Plate" ? "96-well plates" : "Individual tubes"}</strong>
            <p className="mt-2 text-sm text-slate-600">{container === "Plate" ? "Identify each plate and well (A1–H12). Plate reaction rates apply." : "Identify each tube by its physical label. Tube reaction rates apply."}</p>
          </label>)}</div><p className="mt-2 text-sm text-slate-500">Submit tubes and plates as separate orders. Switching keeps your entries; check the required labels before submitting.</p>
        </fieldset>
        <SelectField label="Submission mode" value={draft.submissionMode} options={MODES} onChange={(v) => update("submissionMode", v as OrderDraft["submissionMode"])} />
        <p className="self-center text-sm leading-6 text-slate-500">Standard: DNA and primer requests are recorded separately. Pre-mixed / Ready to load: use one physical tube or well per reaction and choose “Included in mix.” Confirm preparation instructions with the lab.</p>
        <div className="sm:col-span-2"><Field label="Special instructions (optional)"><textarea className="field-input min-h-24" maxLength={2000} value={draft.specialInstructions} onChange={(e) => update("specialInstructions", e.target.value)} /></Field></div>
        <p className="text-sm text-slate-500 sm:col-span-2">Requested services and same-day availability require confirmation. Sequencing rates appear below; additional services require price confirmation. Plate coordinates use A1–H12; the lab must confirm usable wells and controls.</p>
      </div>
    </section>

    <section className="panel space-y-5 p-5 sm:p-6">
      <h2 className="text-lg font-bold">Pickup and billing details</h2>
      <p className="text-sm text-slate-600">Your saved account details are prefilled. Changes apply to this order unless you save them as defaults. Required details are marked *.</p>
      <fieldset disabled={savingDefaults}><OrderDefaultFields value={draft.fulfillment} onChange={(value) => { update("fulfillment", value); setDefaultsMessage(""); setDefaultsError(""); }} /></fieldset>
      <button type="button" className="button-secondary" disabled={savingDefaults} onClick={async () => {
        setSavingDefaults(true); setDefaultsMessage(""); setDefaultsError("");
        try { await saveOrderDefaults(draft.fulfillment); setDefaultsMessage("Saved for future orders on this account. Past orders are unchanged."); }
        catch (error) { setDefaultsError(error instanceof Error ? error.message : "Unable to save defaults."); }
        finally { setSavingDefaults(false); }
      }}>{savingDefaults ? "Saving…" : "Save these details as account defaults"}</button>
      {defaultsMessage ? <p role="status" className="text-sm text-emerald-700">{defaultsMessage}</p> : null}
      {defaultsError ? <p role="alert" className="text-sm text-red-700">{defaultsError}</p> : null}
    </section>

    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-bold">Import from a spreadsheet</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Existing SeqForge CSV and TXT templates are accepted unchanged, including empty trailing columns. The original “Tube label” column identifies the plate when Plate is selected. My primers imports as customer supplied; review stored-primer sources in Details. For additional fields, use the extended template. Use one row per reaction; repeat the same sample ID and identical sample details to add another primer. CSV, TSV, and spreadsheet paste are supported (1 MB, up to {MAX_REACTIONS} reactions). Sample names, locations, template details, concentrations and primer details are filled from the matching columns. Order name, pickup and billing are entered separately. As on the existing site, save Excel files as CSV or tab-delimited TXT before uploading. Template downloads contain example data: replace it with your samples.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a className="button-secondary" href="/templates/sample_dnaForm.csv" download>Download SeqForge CSV template</a>
        <a className="button-secondary" href="/templates/LIMS_Upload_template.xlsx" download>Download SeqForge Excel template</a>
        <a className="button-secondary" href="/templates/sample_text_dnaForm.txt" download>Download SeqForge TXT template</a>
      </div>
      <div className="mt-4"><Field label="Legacy primer choice" hint="Only applies when both My primers and SeqForge Primers are filled. Choose the intended source; one row remains one reaction.">
        <select className="field-input" value={legacyPrimerChoice} onChange={e => { importRevision.current++; setLegacyPrimerChoice(e.target.value as LegacyPrimerChoice); setPendingImport(null); setImportErrors([]); }}>
          <option value="require-single">Ask me if both primer columns are filled</option>
          <option value="customer">Use My primers when both are filled</option>
          <option value="universal">Use SeqForge Primers when both are filled</option>
        </select>
      </Field></div>
      <div className="mt-4 flex flex-wrap items-end gap-4"><button type="button" className="button-secondary" onClick={downloadTemplate}>Download extended CSV template</button><Field label="Upload CSV, TSV or TXT"><input type="file" accept=".csv,.tsv,.txt" className="block max-w-full text-sm" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} /></Field></div>
      <div className="mt-4"><Field label="Paste spreadsheet rows with column headers"><textarea className="field-input min-h-32 font-mono" value={bulkText} onChange={(e) => { importRevision.current++; setBulkText(e.target.value); setPendingImport(null); setImportErrors([]); }} /></Field></div>
      <button type="button" className="button-secondary mt-4" onClick={previewImport} disabled={!bulkText.trim()}>Validate import</button>
      {importErrors.length ? <div role="alert" className="mt-4 max-h-64 overflow-y-auto border-l-2 border-red-500 bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">Import needs corrections. Existing entries are unchanged.</p><ul className="mt-2 list-disc pl-5">{importErrors.map((error, i) => <li key={i}>{error}</li>)}</ul></div> : null}
      {pendingImport ? <div className="mt-4 space-y-4 border border-cyan-200 bg-cyan-50 p-4">
        <p className="text-sm font-semibold">Ready to import: {pendingImport.length} physical samples · {reactionCount(pendingImport)} reactions. Applying this import replaces the sample list below.</p>
        <div className="max-h-96 overflow-auto"><OrderManifest order={{ ...draft, samples: pendingImport }} /></div>
        <button type="button" className="button-primary" onClick={() => { update("samples", pendingImport); setMessage("Imported samples are ready to edit and review."); }}>Replace sample list with this import</button>
      </div> : null}
      {message ? <p role="status" className="mt-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Step 2</p><h2 className="mt-1 text-lg font-bold">Physical samples and reactions</h2><p className="mt-1 text-sm text-slate-500">Add each physical sample once, then add its sequencing primers.</p></div><span className="metric-pill">{draft.samples.length} samples · {count} reactions</span></div>
      {draft.container === "Plate" && <PlateBuilder order={draft} onAdd={samples => { update("samples", samples); setExpandedSample(null); }} />}
      {draft.container === "Plate" && <div className="overflow-x-auto p-5">
        <p className="mb-3 text-sm text-slate-600">Paste one column of sample names into a DNA name cell to fill consecutive rows within that plate. Open Details for concentrations, primer sources, or extra reactions.</p>
        <table className="data-table"><thead><tr><th>Plate / well</th><th>DNA name</th><th>First primer</th><th>Reactions</th><th>Details</th></tr></thead><tbody>
          {draft.samples.map((sample, index) => <tr key={index}>
            <td>{sample.plateLabel || "Unassigned"} / {sample.well || "—"}</td>
            <td><input className="field-input min-w-40" aria-label={`DNA name ${sample.plateLabel} ${sample.well}`} value={sample.sampleName} maxLength={100} onChange={e => update("samples", draft.samples.map((s, i) => i === index ? { ...s, sampleName: e.target.value } : s))} onPaste={e => {
              const text = e.clipboardData.getData("text").replace(/\r\n?/g, "\n");
              if (!text.includes("\n") && !text.includes("\t")) return;
              e.preventDefault();
              const names = text.replace(/\n$/, "").split("\n");
              if (names.some(name => name.includes("\t") || !name.trim() || name.trim().length > 100)) { showErrors(["Paste one column of non-empty DNA names, up to 100 characters each."]); return; }
              const targets = draft.samples.slice(index, index + names.length);
              if (targets.length !== names.length || targets.some(s => s.plateLabel !== sample.plateLabel)) { showErrors(["The pasted names exceed the remaining wells of this plate. Check the starting cell and well order."]); return; }
              update("samples", draft.samples.map((s, i) => i >= index && i < index + names.length ? { ...s, sampleName: names[i - index].trim() } : s)); setErrors([]);
            }} /></td>
            <td><input className="field-input min-w-40" aria-label={`First primer ${sample.plateLabel} ${sample.well}`} value={sample.reactions[0].primerName} maxLength={100} onChange={e => update("samples", draft.samples.map((s, i) => i === index ? { ...s, reactions: s.reactions.map((r, j) => j === 0 ? { ...r, primerName: e.target.value } : r) } : s))} /></td>
            <td>{sample.reactions.length}</td><td><button type="button" className="button-secondary" aria-expanded={expandedSample === index} onClick={() => setExpandedSample(expandedSample === index ? null : index)}>Details {sample.well}</button></td>
          </tr>)}
        </tbody></table>
      </div>}
      {draft.samples.map((sample, index) => draft.container === "Tubes" || expandedSample === index ? <SampleEditor key={index} sample={sample} number={index + 1} container={draft.container} mode={draft.submissionMode} canRemove={draft.samples.length > 1} canAddReaction={count < MAX_REACTIONS} onRemove={() => { update("samples", draft.samples.filter((_, i) => i !== index)); setExpandedSample(null); }} onChange={(value) => update("samples", draft.samples.map((s, i) => i === index ? value : s))} /> : null)}
      <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 p-5">
        <button type="button" className="button-secondary" disabled={count >= MAX_REACTIONS} onClick={addSample}><Plus className="h-4 w-4" />Add physical sample</button>
        <button type="button" className="button-secondary" disabled={draft.samples.length < 2} onClick={() => update("samples", draft.samples.map((sample) => ({ ...sample, templateType: draft.samples[0].templateType, preparation: draft.samples[0].preparation })))}>Apply sample 1 template and preparation to all</button>
      </div>
    </section>
    {errorPanel}
    <OrderPricing snapshot={priceOrder(draft)} />
    <div className="flex justify-end gap-3"><button type="button" onClick={() => router.back()} className="button-secondary">Cancel</button><button type="submit" className="button-primary">Review order</button></div>
  </form>;
}
