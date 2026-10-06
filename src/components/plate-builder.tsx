"use client";

import { useState } from "react";
import { Field, SelectField, TextField } from "@/components/sample-editor";
import { addPlate } from "@/lib/plate-intake";
import type { OrderDraft, SampleDraft } from "@/lib/order-intake";

export function PlateBuilder({ order, onAdd }: { order: OrderDraft; onAdd: (samples: SampleDraft[]) => void }) {
  const [label, setLabel] = useState("Plate-1");
  const [count, setCount] = useState("96");
  const [direction, setDirection] = useState("By column: A1, B1 … H1, A2");
  const [prefix, setPrefix] = useState("Sample");
  const [primer, setPrimer] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-5 sm:p-6">
    <h3 className="font-bold">Add a whole plate at once</h3>
    <p className="text-sm text-slate-600">Create all 96 wells, or the first occupied wells of a partial plate. Names start as prefix + well; edit them in the table or paste a column of names from Excel. Existing plates are kept.</p>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <TextField label="New plate label" value={label} onChange={setLabel} />
      <Field label="Occupied wells (1–96)"><input type="number" className="field-input" min={1} max={96} value={count} onChange={e => setCount(e.target.value)} /></Field>
      <SelectField label="Well filling order" value={direction} options={["By column: A1, B1 … H1, A2", "By row: A1, A2 … A12, B1"]} onChange={setDirection} />
      <TextField label="Initial sample-name prefix" value={prefix} onChange={setPrefix} maxLength={90} />
      <TextField label={order.submissionMode === "Standard" ? "Shared customer-supplied primer name (optional)" : "Shared included primer name (optional)"} value={primer} onChange={setPrimer} hint="Leave blank for different primers. Use well details for universal, stored or synthesized primers." />
    </div>
    <button type="button" className="button-secondary" onClick={() => {
      try {
        const samples = addPlate(order, { label, count: Number(count), direction: direction.startsWith("By column") ? "column" : "row", prefix, primerName: primer });
        onAdd(samples); setError(""); setMessage(`Added ${count} wells to ${label.trim()}. Check sample names and primer details before reviewing.`);
      } catch (e) { setMessage(""); setError(e instanceof Error ? e.message : "Unable to add plate."); }
    }}>Add {count || "0"} wells</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
  </div>;
}
