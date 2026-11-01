"use client";

import { useEffect, useState } from "react";
import { DropboxBrowser } from "./dropbox-browser";
import { dropboxSnapshot, type DropboxLocation } from "@/lib/dropboxes";
import type { OrderDefaults } from "@/lib/order-defaults";

export function DropboxSelector({ value, onChange }: { value: OrderDefaults; onChange: (value: OrderDefaults) => void }) {
  const [locations, setLocations] = useState<DropboxLocation[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/dropboxes", { cache: "no-store", signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load dropbox locations. Retry, or choose another delivery method.");
      const data = await response.json();
      setLocations(data.locations); setError("");
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Could not load dropbox locations."); });
    return () => abort.abort();
  }, [reload]);
  const current = locations?.find(location => location.id === value.dropboxId);
  const stale = !!locations && !!value.dropboxId && (!current || value.dropbox?.revision !== current.revision);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Choose your dropbox</p><a className="text-sm font-semibold text-teal-700 underline" href="/dropboxes" target="_blank" rel="noopener noreferrer">Explore locations</a></div>
    <p className="text-sm text-slate-600">Click a location in the list or a pin on the map to use it for this order.</p>
    {value.dropbox && <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm"><strong>Selected: {value.dropbox.name}</strong><p>{value.dropbox.address}</p></div>}
    {stale && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your saved dropbox selection changed or is no longer available. Review the current details and select a location again.</p>}
    {error ? <p role="alert" className="text-sm text-red-800">{error} <button type="button" className="underline" onClick={() => setReload(value => value + 1)}>Retry</button></p> : locations === null ? <p role="status" className="text-sm text-slate-500">Loading dropbox locations…</p> : <DropboxBrowser locations={locations} selectedId={stale ? undefined : value.dropboxId} compact onSelect={location => onChange({ ...value, deliveryMethod: "Dropbox", dropboxId: location.id, dropbox: dropboxSnapshot(location) })} />}
    <p className="text-xs leading-5 text-slate-500">Sanger and Whole Plasmid samples only. Include the printed order manifest with your labelled samples. Confirm the exact box position and collection schedule before depositing samples.</p>
  </div>;
}
