"use client";

import { Check, ExternalLink, LoaderCircle, MapPin, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { DropboxLocation } from "@/lib/dropboxes";
import "./dropboxes.css";

type LocationDraft = { name: string; address: string; placementInstructions: string; pickupSchedule: string; accessNotes: string; latitude: string; longitude: string; active: boolean };
const blank = (): LocationDraft => ({ name: "", address: "", placementInstructions: "", pickupSchedule: "", accessNotes: "", latitude: "", longitude: "", active: false });
const editable = (location: DropboxLocation): LocationDraft => ({ name: location.name, address: location.address, placementInstructions: location.placementInstructions, pickupSchedule: location.pickupSchedule, accessNotes: location.accessNotes, latitude: location.latitude === null ? "" : String(location.latitude), longitude: location.longitude === null ? "" : String(location.longitude), active: location.active });

export function AdminDropboxes({ initial }: { initial: DropboxLocation[] }) {
  const [locations, setLocations] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LocationDraft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const submitting = useRef(false);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const editing = locations.find(location => location.id === editingId);

  function change<K extends keyof LocationDraft>(key: K, value: LocationDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setMessage(""); }
  function open(location?: DropboxLocation) {
    setEditingId(location?.id ?? null); setDraft(location ? editable(location) : blank()); setError(""); setMessage(""); setConflict(false);
    requestAnimationFrame(() => formHeading.current?.focus());
  }
  async function loadLatest() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/dropboxes", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load the current locations.");
      const next: DropboxLocation[] = Array.isArray(payload) ? payload : payload.locations;
      if (!Array.isArray(next)) throw new Error("Unable to read the current locations.");
      const current = next.find(location => location.id === editingId);
      setLocations(next); setEditingId(current?.id ?? null); setDraft(current ? editable(current) : blank()); setConflict(false); setMessage("Latest saved details loaded. Review them before making changes.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load current details. Try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || conflict) return;
    setError(""); setMessage("");
    if (!draft.name.trim() || !draft.address.trim()) { setError("Enter the location name and address."); return; }
    const hasLatitude = !!draft.latitude.trim(), hasLongitude = !!draft.longitude.trim();
    if (hasLatitude !== hasLongitude) { setError("Enter both latitude and longitude, or leave both blank until the map location is confirmed."); return; }
    const latitude = hasLatitude ? Number(draft.latitude) : null;
    const longitude = hasLongitude ? Number(draft.longitude) : null;
    if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) { setError("Use a latitude between −90 and 90 and a longitude between −180 and 180."); return; }
    if (editingId && !editing) { setError("This location is no longer in the current list. Reload the saved locations."); setConflict(true); return; }
    submitting.current = true; setBusy(true);
    try {
      const response = await fetch(editingId ? `/api/admin/dropboxes/${encodeURIComponent(editingId)}` : "/api/admin/dropboxes", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, latitude, longitude, ...(editing ? { expectedRevision: editing.revision } : {}) }),
      });
      const payload = await response.json();
      if (response.status === 409) { setConflict(true); throw new Error("Another administrator updated this location. Your changes have not been saved. Load the latest saved details before editing again."); }
      if (!response.ok) throw new Error(payload.error || "Unable to save this location.");
      const location: DropboxLocation = payload.location;
      if (!location?.id) throw new Error("The save response was incomplete. Reload the saved locations before trying again.");
      setLocations(current => [...current.filter(item => item.id !== location.id), location].sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(location.id); setDraft(editable(location)); setMessage(location.active ? "Location saved and available to customers." : "Location saved as inactive. Customers cannot choose it for new orders.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The connection was interrupted. Your entries are still here; check the saved locations before trying again."); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <div className="dropbox-admin">
    <div className="dropbox-admin-toolbar"><p>{locations.filter(location => location.active).length} active · {locations.length} total locations</p><Link className="button-secondary" href="/dropboxes" target="_blank" rel="noopener noreferrer">View public map <ExternalLink size={15} /><span className="sr-only"> in a new tab</span></Link></div>
    <div className="dropbox-admin-layout"><section className="panel dropbox-admin-list"><div className="panel-heading"><h2 className="text-lg font-bold">All locations</h2><button type="button" className="button-secondary" onClick={() => open()} disabled={busy}><Plus size={16} /> Add</button></div>{locations.length ? <ul>{locations.map(location => <li key={location.id}><button type="button" className={`dropbox-admin-location${editingId === location.id ? " is-selected" : ""}`} onClick={() => open(location)} disabled={busy} aria-pressed={editingId === location.id}><MapPin size={19} aria-hidden="true" /><span><strong>{location.name}</strong><small>{location.address}</small><span className={`dropbox-active-badge${location.active ? " is-active" : ""}`}>{location.active ? "Active" : "Inactive"}</span></span><Pencil size={15} aria-hidden="true" /></button></li>)}</ul> : <p className="p-5 text-sm text-slate-500">Add the first dropbox location using this form.</p>}</section>
      <form className="panel dropbox-admin-form" onSubmit={save} noValidate><div className="panel-heading"><div><h2 ref={formHeading} tabIndex={-1} className="text-lg font-bold">{editingId ? "Edit location" : "Add a dropbox"}</h2><p className="mt-1 text-sm text-slate-500">{editing ? `Revision ${editing.revision}` : "New locations start inactive until you enable them."}</p></div></div><fieldset disabled={busy} className="dropbox-admin-fields">
        <label className="field-label">Location name *<input className="field-input mt-2" value={draft.name} maxLength={120} onChange={event => change("name", event.target.value)} placeholder="Campus · Building" /></label>
        <label className="field-label">Street address *<textarea className="field-input mt-2" rows={2} value={draft.address} maxLength={500} onChange={event => change("address", event.target.value)} placeholder="Building, street, city, state and postal code" /></label>
        <label className="field-label">Exact dropbox placement<textarea className="field-input mt-2" rows={3} value={draft.placementInstructions} maxLength={1000} onChange={event => change("placementInstructions", event.target.value)} placeholder="Entrance, floor, room or nearby landmark" /><small>Tell customers where the SeqForge box is inside or around the building.</small></label>
        <label className="field-label">Pickup schedule<textarea className="field-input mt-2" rows={2} value={draft.pickupSchedule} maxLength={500} onChange={event => change("pickupSchedule", event.target.value)} placeholder="Confirmed collection days, cutoff time and time zone" /><small>Include holiday exceptions or say that the schedule requires confirmation.</small></label>
        <label className="field-label">Access notes<textarea className="field-input mt-2" rows={3} value={draft.accessNotes} maxLength={1000} onChange={event => change("accessNotes", event.target.value)} placeholder="Building hours, badge access or instructions for visitors" /></label>
        <div className="dropbox-admin-coordinates"><label className="field-label">Latitude<input className="field-input mt-2" inputMode="decimal" value={draft.latitude} maxLength={24} onChange={event => change("latitude", event.target.value)} placeholder="Optional" /></label><label className="field-label">Longitude<input className="field-input mt-2" inputMode="decimal" value={draft.longitude} maxLength={24} onChange={event => change("longitude", event.target.value)} placeholder="Optional" /></label><p>Enter a confirmed map position, or leave both blank. Locations without coordinates still appear in the list.</p></div>
        <label className="dropbox-active-toggle"><input type="checkbox" checked={draft.active} onChange={event => change("active", event.target.checked)} /><span><strong>Show this dropbox to customers</strong><small>Inactive locations remain in the administrator list. Saved order details are preserved.</small></span></label>
      </fieldset><div className="dropbox-admin-form-footer">{error && <p className="dropbox-admin-error" role="alert">{error}</p>}{message && <p className="dropbox-admin-success" role="status"><Check size={17} />{message}</p>}{conflict ? <div><p className="mb-3 text-sm text-slate-600">Loading the latest saved details replaces the unsaved entries in this form.</p><button type="button" className="button-secondary" onClick={loadLatest} disabled={busy}>Load latest saved details</button></div> : <div className="flex flex-wrap gap-3"><button className="button-primary" type="submit" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? "Saving…" : editingId ? "Save changes" : "Add location"}</button>{editingId && <button type="button" className="button-secondary" disabled={busy} onClick={() => open(editing)}>Reset form</button>}</div>}</div></form>
    </div>
  </div>;
}
