"use client";

import { Check, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/orders";
import { isOligoProductionBlocked } from "@/lib/oligo-schema";

export function StatusControl({ orderId, currentStatus, service = "SANGER", hasResult, customerEmail, revision, holdReason, holdPreviousStatus }: {
  orderId: string; currentStatus: string; service?: string; hasResult: boolean; customerEmail: string;
  revision: number; holdReason: string | null; holdPreviousStatus: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [holdMessage, setHoldMessage] = useState(holdReason || "");
  const [resolutionMessage, setResolutionMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const requestRef = useRef<{ signature: string; key: string } | null>(null);
  const isHeld = currentStatus === "ON_HOLD";
  const holdAction = isHeld || status === "ON_HOLD";
  const reason = status === "ON_HOLD" ? holdMessage : resolutionMessage;
  const statusOptions = ORDER_STATUSES.filter(value => !isOligoProductionBlocked(service, value) && !(isHeld && value === "COMPLETED"));
  const hasChange = status !== currentStatus || (status === "ON_HOLD" && holdMessage.trim() !== (holdReason || ""));
  const resumeStatus = holdPreviousStatus && statusOptions.some(value => value === holdPreviousStatus) && holdPreviousStatus !== "ON_HOLD" ? holdPreviousStatus : "RECEIVED";

  async function updateStatus() {
    setLoading(true);
    setSaved(false);
    setError("");
    setStale(false);
    try {
      const body = { status, expectedRevision: revision, ...(holdAction ? { reason: reason.trim() } : {}) };
      const signature = JSON.stringify(body);
      if (requestRef.current?.signature !== signature) requestRef.current = { signature, key: crypto.randomUUID() };
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestRef.current.key },
        body: signature,
      });
      const payload = await response.json();
      if (response.status === 409) setStale(true);
      if (!response.ok) throw new Error(payload.error || "Unable to update the order status.");
      setSaved(true);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update the order status. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <label className="field-label">
        {isHeld && status !== "ON_HOLD" ? "Resume at" : "Status"}
        <select className="field-input mt-2" value={status} disabled={loading} onChange={(event) => { setStatus(event.target.value); setSaved(false); }}>
          {statusOptions.map((value) => (
            <option key={value} value={value}>{STATUS_LABELS[value]}</option>
          ))}
        </select>
      </label>
      {isHeld && status === "ON_HOLD" && <button type="button" disabled={loading} onClick={() => { setStatus(resumeStatus); setSaved(false); }} className="button-secondary mt-3 w-full justify-center">Resolve hold</button>}
      {holdAction && <div className="mt-4">
        <label className="field-label">{status === "ON_HOLD" ? "Customer message & next steps" : "Resolution message"}<span className="text-rose-700"> *</span>
          <textarea className="field-input mt-2 min-h-28" maxLength={1000} required disabled={loading} value={reason} onChange={event => { if (status === "ON_HOLD") setHoldMessage(event.target.value); else setResolutionMessage(event.target.value); setSaved(false); }} placeholder={status === "ON_HOLD" ? "Explain what needs attention and what the customer should do next." : "Explain what was resolved and what happens next."} />
        </label>
        <p className="mt-2 text-xs leading-5 text-slate-600">This message appears in the customer’s order and is emailed to <strong className="break-all">{customerEmail}</strong>. Include only information intended for the customer.</p>
        {status === "ON_HOLD" && <p className="mt-2 text-xs leading-5 text-rose-800">This pauses the order and hides any published result. It does not cancel the order or change its price.</p>}
      </div>}
      {service === "OLIGO" && <p className="mt-3 text-xs text-amber-900">Quote pending. This version records requests for lab review; production and completion remain unavailable until customer quote approval can be recorded.</p>}
      {status === "COMPLETED" && service !== "OLIGO" && <p className="mt-3 text-xs leading-5 text-slate-600">{hasResult ? <>Completing releases the current result to the customer and queues a results-ready email to <strong className="break-all">{customerEmail}</strong>. Check the file before continuing. Each order sends this notification only once; completing it again will not send another.</> : "Upload and check a result file before completing this order."}</p>}
      {currentStatus === "COMPLETED" && status !== "COMPLETED" && <p className="mt-3 text-xs leading-5 text-amber-900">Changing this status hides the result from the customer until the order is completed again.</p>}
      <button type="button" onClick={updateStatus} disabled={loading || !hasChange || (holdAction && !reason.trim()) || (status === "COMPLETED" && !hasResult)} className="button-primary mt-3 w-full justify-center">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Status updated" : status === "ON_HOLD" ? isHeld ? "Update message & notify" : "Place on hold & notify" : isHeld ? "Resolve & notify customer" : status === "COMPLETED" ? "Complete & release result" : "Update status"}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
      {stale && <button type="button" onClick={() => router.refresh()} className="mt-2 text-xs font-bold text-cyan-800 underline">Reload latest order</button>}
    </div>
  );
}

export function ResultUpload({ orderId, existingName, completed }: { orderId: string; existingName?: string; completed: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError("");
    setSaved(false);
    const data = new FormData();
    data.set("file", file);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/result`, { method: "POST", body: data });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to upload the result.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setSaved(true);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to upload the result. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {existingName ? <p className="mb-3 text-xs text-slate-500">Current file: <span className="font-semibold text-slate-700">{existingName}</span></p> : null}
      {completed ? <p className="text-xs leading-5 text-slate-600">This result is published. Move the order back to QC before replacing the file, then complete it again to release the replacement. The first results-ready notification will not be sent again.</p> : <>
      <p className="mb-3 text-xs leading-5 text-slate-600">Upload a file for review. The customer can download it after you set the order to Completed.</p>
      <label className="block cursor-pointer border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-cyan-500 hover:bg-cyan-50/40">
        <Upload className="mx-auto h-5 w-5 text-slate-400" />
        <span className="mt-2 block truncate text-sm font-semibold text-slate-700">{file ? file.name : "Choose result file"}</span>
        <span className="mt-1 block text-xs text-slate-400">AB1, ZIP, PDF, FASTA or text · 25 MB max</span>
        <input ref={inputRef} type="file" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <button type="button" onClick={upload} disabled={!file || loading} className="button-primary mt-3 w-full justify-center">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload for review
      </button>
      </>}
      {saved && !completed ? <p role="status" className="mt-2 text-xs text-emerald-700">File saved for review. Check it, then set the order to Completed to release it.</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
