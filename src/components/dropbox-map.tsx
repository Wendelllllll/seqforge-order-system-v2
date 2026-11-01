"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { DropboxLocation } from "@/lib/dropboxes";
import "leaflet/dist/leaflet.css";

type Props = { locations: DropboxLocation[]; selectedId?: string | null; onSelect: (location: DropboxLocation) => void };

export function DropboxMap({ locations, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const select = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [tileWarning, setTileWarning] = useState(false);
  const points = locations.flatMap(location => location.latitude !== null && location.longitude !== null ? [[location.latitude, location.longitude] as [number, number]] : []);
  function showAll() { if (points.length) map.current?.fitBounds(points, { padding: [48, 48], maxZoom: points.length === 1 ? 16 : 12, animate: false }); }

  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    let disposed = false;
    let instance: LeafletMap | null = null;
    let observer: ResizeObserver | undefined;
    const currentMarkers = markers.current;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      leaflet.current = L;
      instance = L.map(container.current, { scrollWheelZoom: false, zoomControl: true }).setView([33.45, -117.3], 8);
      map.current = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on("tileerror", () => { if (!disposed) setTileWarning(true); }).addTo(instance);
      L.control.scale({ imperial: true, metric: true }).addTo(instance);
      observer = new ResizeObserver(() => instance?.invalidateSize({ animate: false }));
      observer.observe(container.current);
      setReady(true);
    }).catch(() => { if (!disposed) setUnavailable(true); });
    return () => {
      disposed = true;
      observer?.disconnect();
      instance?.remove();
      map.current = null;
      currentMarkers.clear();
    };
  }, []);

  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (!ready || !L || !instance) return;
    markers.current.forEach(marker => marker.remove());
    markers.current.clear();
    const bounds: [number, number][] = [];
    locations.forEach((location, index) => {
      if (location.latitude === null || location.longitude === null) return;
      const point: [number, number] = [location.latitude, location.longitude];
      bounds.push(point);
      const marker = L.marker(point, {
        title: location.name,
        keyboard: true,
        icon: L.divIcon({ className: "dropbox-pin", html: `<span>${index + 1}</span>`, iconSize: [36, 36], iconAnchor: [18, 36] }),
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = location.name;
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -34] });
      marker.on("click", () => select.current(location));
      marker.addTo(instance);
      marker.getElement()?.setAttribute("aria-label", `Select ${location.name}`);
      markers.current.set(location.id, marker);
    });
    if (bounds.length) instance.fitBounds(bounds, { padding: [48, 48], maxZoom: bounds.length === 1 ? 16 : 12, animate: false });
  }, [locations, ready]);

  useEffect(() => {
    const L = leaflet.current;
    if (!ready || !L || !map.current) return;
    locations.forEach((location, index) => {
      const active = location.id === selectedId;
      const marker = markers.current.get(location.id);
      marker?.setIcon(L.divIcon({ className: `dropbox-pin${active ? " dropbox-pin-selected" : ""}`, html: `<span>${index + 1}</span>`, iconSize: [36, 36], iconAnchor: [18, 36] }));
      marker?.setZIndexOffset(active ? 500 : 0);
      if (active && marker) {
        map.current?.setView(marker.getLatLng(), 17, { animate: false });
        marker.openTooltip();
      }
    });
  }, [locations, selectedId, ready]);

  return <div className="dropbox-map-frame">
    <div ref={container} className="seqforge-dropbox-map" role="region" aria-label="Interactive map of SeqForge dropbox locations" />
    {ready && !unavailable && points.length > 0 && <button type="button" className="dropbox-map-overview" onClick={showAll}>Show all locations</button>}
    {unavailable ? <div className="dropbox-map-fallback" role="status"><strong>The map could not load.</strong><p>You can still choose a location from the list and open directions.</p></div> : !ready ? <div className="dropbox-map-loading" role="status">Loading the map…</div> : null}
    {tileWarning && <p className="dropbox-map-warning" role="status">Some map tiles could not load. The location list and directions are still available.</p>}
  </div>;
}
