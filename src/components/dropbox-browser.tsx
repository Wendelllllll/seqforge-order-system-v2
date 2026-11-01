"use client";

import { ArrowRight, Check, Clock3, MapPin, Navigation, PackageCheck, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { DropboxLocation } from "@/lib/dropboxes";
import { DropboxMap } from "./dropbox-map";
import "./dropboxes.css";

type Props = { locations: DropboxLocation[]; selectedId?: string | null; onSelect?: (location: DropboxLocation) => void; compact?: boolean };

export function DropboxBrowser({ locations, selectedId, onSelect, compact = false }: Props) {
  const [query, setQuery] = useState("");
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const activeLocations = useMemo(() => locations.filter(location => location.active), [locations]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return activeLocations.filter(location => `${location.name} ${location.address}`.toLowerCase().includes(search));
  }, [activeLocations, query]);
  const chosenId = onSelect ? selectedId : localSelection;
  const selected = activeLocations.find(location => location.id === chosenId);
  function choose(location: DropboxLocation) { setLocalSelection(location.id); onSelect?.(location); }
  const destination = selected && selected.latitude !== null && selected.longitude !== null ? `${selected.latitude},${selected.longitude}` : selected ? `${selected.name}, ${selected.address}` : "";

  return <div className={`dropbox-browser${compact ? " dropbox-browser-compact" : ""}`}>
    <div className="dropbox-browser-toolbar"><label className="dropbox-search"><span className="sr-only">Search dropboxes by campus, building or address</span><Search size={19} aria-hidden="true" /><input type="search" value={query} maxLength={160} onChange={event => setQuery(event.target.value)} placeholder="Search campus, building or address" /></label><p aria-live="polite">{filtered.length} {filtered.length === 1 ? "location" : "locations"}</p></div>
    <div className="dropbox-explorer">
      <div className="dropbox-location-list" aria-label="Dropbox locations">
        {filtered.length ? <ul>{filtered.map((location, index) => <li key={location.id}><button type="button" className={`dropbox-location-card${location.id === chosenId ? " is-selected" : ""}`} aria-pressed={location.id === chosenId} onClick={() => choose(location)}><span className="dropbox-location-number" aria-hidden="true">{location.id === chosenId ? <Check size={17} /> : index + 1}</span><span><strong>{location.name}</strong><span className="dropbox-address">{location.address || "Address awaiting confirmation"}</span><span className="dropbox-card-hint">{location.latitude === null || location.longitude === null ? "Map location awaiting confirmation" : "View location details"}</span></span><ArrowRight size={16} className="dropbox-card-arrow" aria-hidden="true" /></button></li>)}</ul> : <div className="dropbox-list-empty"><MapPin size={28} aria-hidden="true" /><strong>{activeLocations.length ? "No matching locations" : "Locations are being confirmed"}</strong><p>{activeLocations.length ? "Try a campus name or clear your search." : "Contact our team to arrange sample delivery."}</p>{query && <button type="button" className="dropbox-text-button" onClick={() => setQuery("")}>Clear search</button>}</div>}
      </div>
      <DropboxMap locations={filtered} selectedId={chosenId} onSelect={choose} />
    </div>
    {selected ? <section className="dropbox-details" aria-label="Selected dropbox details" aria-live="polite">
      <div className="dropbox-details-heading"><div><p className="eyebrow">{onSelect ? "Selected dropbox" : "Your drop-off location"}</p><h2>{selected.name}</h2><p>{selected.address || "Street address awaiting confirmation"}</p></div><a className="button-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`} target="_blank" rel="noopener noreferrer"><Navigation size={16} /> Open directions<span className="sr-only"> in a new tab</span></a></div>
      <div className="dropbox-detail-grid"><Detail icon={MapPin} label="Find the dropbox" text={selected.placementInstructions || "Confirm the exact dropbox placement with our team before bringing samples."} /><Detail icon={Clock3} label="Pickup schedule" text={selected.pickupSchedule || "Confirm the next collection time with our team."} /><Detail icon={ShieldCheck} label="Building access" text={selected.accessNotes || "Building access may vary. Confirm any entry requirements before visiting."} /></div>
      {(selected.latitude === null || selected.longitude === null) && <p className="dropbox-coordinate-note">Map location awaiting confirmation. Directions use the location name and address; confirm the entrance and dropbox placement before visiting.</p>}
      {!onSelect && <div className="dropbox-order-links"><p><PackageCheck size={18} aria-hidden="true" /><span>Submit your order before dropping off your samples. Label your tubes or plate to match your order.</span></p><div><Link className="button-primary" href={`/orders/new?service=sanger&dropbox=${encodeURIComponent(selected.id)}`}>Start a Sanger order <ArrowRight size={16} /></Link><Link className="button-secondary" href={`/orders/new?service=whole-plasmid&dropbox=${encodeURIComponent(selected.id)}`}>Whole Plasmid order</Link></div></div>}
    </section> : <div className="dropbox-selection-prompt"><MapPin size={21} aria-hidden="true" /><p>Select a location on the map or in the list to see drop-off instructions, collection times and building access.</p></div>}
  </div>;
}

function Detail({ icon: Icon, label, text }: { icon: typeof MapPin; label: string; text: string }) {
  return <div className="dropbox-detail-item"><Icon size={19} aria-hidden="true" /><div><h3>{label}</h3><p>{text}</p></div></div>;
}
