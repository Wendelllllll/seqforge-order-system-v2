"use client";

import { Beaker, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PRIMER_SOURCES, TEMPLATE_TYPES } from "@/lib/orders";

type SampleDraft = {
  sampleName: string;
  templateType: string;
  concentration: string;
  primerName: string;
  primerSource: string;
  notes: string;
};

const blankSample = (): SampleDraft => ({
  sampleName: "",
  templateType: "Plasmid DNA",
  concentration: "",
  primerName: "",
  primerSource: "Customer supplied",
  notes: "",
});

export function OrderForm() {
  const router = useRouter();
  const [samples, setSamples] = useState<SampleDraft[]>([blankSample()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateSample(index: number, field: keyof SampleDraft, value: string) {
    setSamples((current) =>
      current.map((sample, sampleIndex) =>
        sampleIndex === index ? { ...sample, [field]: value } : sample,
      ),
    );
  }

  function addSample() {
    setSamples((current) => [...current, blankSample()]);
  }

  function removeSample(index: number) {
    setSamples((current) => current.filter((_, sampleIndex) => sampleIndex !== index));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderName: String(data.get("orderName")),
        poNumber: String(data.get("poNumber")),
        specialInstructions: String(data.get("specialInstructions")),
        samples,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || "Unable to submit the order.");
      setLoading(false);
      return;
    }

    router.push(`/orders/${payload.id}?submitted=1`);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-6">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Order information</h2>
          </div>
          <span className="service-chip"><Beaker className="h-3.5 w-3.5" /> Sanger sequencing</span>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <label className="sm:col-span-2 field-label">
            Order name / reference
            <input name="orderName" className="field-input mt-2" placeholder="e.g. TP53 confirmation – September" required maxLength={120} />
          </label>
          <label className="field-label">
            PO number <span className="font-normal text-slate-400">(optional)</span>
            <input name="poNumber" className="field-input mt-2" placeholder="PO-10482" maxLength={80} />
          </label>
          <div className="hidden sm:block" />
          <label className="sm:col-span-2 field-label">
            Special instructions <span className="font-normal text-slate-400">(optional)</span>
            <textarea name="specialInstructions" className="field-input mt-2 min-h-24 resize-y" placeholder="Add handling notes or sequencing requirements." maxLength={2000} />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading items-center">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Samples and primers</h2>
            <p className="mt-1 text-sm text-slate-500">Add one row for each sequencing reaction.</p>
          </div>
          <span className="metric-pill">{samples.length} {samples.length === 1 ? "sample" : "samples"}</span>
        </div>

        <div className="divide-y divide-slate-200">
          {samples.map((sample, index) => (
            <div key={index} className="p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
                  <h3 className="text-sm font-bold text-slate-900">Sample {index + 1}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => removeSample(index)}
                  disabled={samples.length === 1}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SampleField label="Sample name" required>
                  <input className="field-input" value={sample.sampleName} onChange={(event) => updateSample(index, "sampleName", event.target.value)} required maxLength={100} />
                </SampleField>
                <SampleField label="Template type" required>
                  <select className="field-input" value={sample.templateType} onChange={(event) => updateSample(index, "templateType", event.target.value)}>
                    {TEMPLATE_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </SampleField>
                <SampleField label="Concentration" hint="Optional; include units">
                  <input className="field-input" value={sample.concentration} onChange={(event) => updateSample(index, "concentration", event.target.value)} placeholder="e.g. 100 ng/µL" maxLength={60} />
                </SampleField>
                <SampleField label="Primer" required>
                  <input className="field-input" value={sample.primerName} onChange={(event) => updateSample(index, "primerName", event.target.value)} placeholder="e.g. M13F" required maxLength={100} />
                </SampleField>
                <SampleField label="Primer source" required>
                  <select className="field-input" value={sample.primerSource} onChange={(event) => updateSample(index, "primerSource", event.target.value)}>
                    {PRIMER_SOURCES.map((source) => <option key={source}>{source}</option>)}
                  </select>
                </SampleField>
                <SampleField label="Notes" hint="Optional">
                  <input className="field-input" value={sample.notes} onChange={(event) => updateSample(index, "notes", event.target.value)} placeholder="Sample-specific notes" maxLength={500} />
                </SampleField>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <button type="button" onClick={addSample} className="button-secondary">
            <Plus className="h-4 w-4" /> Add another sample
          </button>
        </div>
      </section>

      {error ? <div role="alert" className="border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <button type="button" onClick={() => router.back()} className="button-secondary justify-center">Cancel</button>
        <button type="submit" disabled={loading} className="button-primary justify-center sm:min-w-44">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Submit order
        </button>
      </div>
    </form>
  );
}

function SampleField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="field-label">
      {label} {required ? <span className="text-cyan-700">*</span> : null}
      <span className="mt-2 block">{children}</span>
      {hint ? <span className="mt-1 block text-xs font-normal text-slate-400">{hint}</span> : null}
    </label>
  );
}
