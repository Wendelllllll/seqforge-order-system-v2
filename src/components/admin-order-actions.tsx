"use client";

import { Check, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/orders";
import { isOligoProductionBlocked } from "@/lib/oligo-schema";

export function StatusControl({ orderId, currentStatus, service = "SANGER" }: { orderId: string; currentStatus: string; service?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus() {
    setLoading(true);
    setSaved(false);
    setError("");
    const response = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "Unable to update the order status.");
      setLoading(false);
      return;
    }

    setSaved(true);
    setLoading(false);
    router.refresh();
  }

  return (
    <div>
      <label className="field-label">
        Current status
        <select className="field-input mt-2" value={status} onChange={(event) => { setStatus(event.target.value); setSaved(false); }}>
          {ORDER_STATUSES.filter(value => !isOligoProductionBlocked(service, value)).map((value) => (
            <option key={value} value={value}>{STATUS_LABELS[value]}</option>
          ))}
        </select>
      </label>
      {service === "OLIGO" && <p className="mt-3 text-xs text-amber-900">Quote pending. This version records requests for lab review; production and completion remain unavailable until customer quote approval can be recorded.</p>}
      <button type="button" onClick={updateStatus} disabled={loading || status === currentStatus} className="button-primary mt-3 w-full justify-center">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Status updated" : "Update status"}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function ResultUpload({ orderId, existingName }: { orderId: string; existingName?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError("");
    const data = new FormData();
    data.set("file", file);
    const response = await fetch(`/api/admin/orders/${orderId}/result`, {
      method: "POST",
      body: data,
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "Unable to upload the result.");
      setLoading(false);
      return;
    }

    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    setLoading(false);
    router.refresh();
  }

  return (
    <div>
      {existingName ? <p className="mb-3 text-xs text-slate-500">Current file: <span className="font-semibold text-slate-700">{existingName}</span></p> : null}
      <label className="block cursor-pointer border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-cyan-500 hover:bg-cyan-50/40">
        <Upload className="mx-auto h-5 w-5 text-slate-400" />
        <span className="mt-2 block truncate text-sm font-semibold text-slate-700">{file ? file.name : "Choose result file"}</span>
        <span className="mt-1 block text-xs text-slate-400">AB1, ZIP, PDF, FASTA or text · 25 MB max</span>
        <input ref={inputRef} type="file" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <button type="button" onClick={upload} disabled={!file || loading} className="button-primary mt-3 w-full justify-center">
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload and complete order
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
