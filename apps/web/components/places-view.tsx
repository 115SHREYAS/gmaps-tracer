"use client";

import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapView } from "@/components/map-view";
import { createCirclePolygon, iconForPlace } from "@/lib/geo";

interface PlaceOccupant {
  id: string;
  name: string;
}

interface PlaceItem {
  id: string;
  name: string;
  icon: string;
  lat: number;
  lng: number;
  radiusM: number;
  notifyOnEnter: boolean;
  notifyOnLeave: boolean;
  createdAt: string;
  occupants?: PlaceOccupant[];
}

const AVAILABLE_ICONS = [
  { key: "home", label: "Home" },
  { key: "work", label: "Work" },
  { key: "gym", label: "Gym" },
  { key: "school", label: "School" },
  { key: "coffee", label: "Cafe" },
  { key: "shop", label: "Shop" },
  { key: "star", label: "Star" },
  { key: "airport", label: "Airport" },
  { key: "pin", label: "Pin" },
];

export function PlacesView() {
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [map, setMap] = useState<MlMap | null>(null);

  // Form / modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("pin");
  const [formLat, setFormLat] = useState<number | "">("");
  const [formLng, setFormLng] = useState<number | "">("");
  const [formRadius, setFormRadius] = useState(100);
  const [formNotifyEnter, setFormNotifyEnter] = useState(true);
  const [formNotifyLeave, setFormNotifyLeave] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const placeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);

  const loadPlaces = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/places", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as PlaceItem[];
        setPlaces(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  // Setup map click listener to drop pins
  useEffect(() => {
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const lat = Number(e.lngLat.lat.toFixed(6));
      const lng = Number(e.lngLat.lng.toFixed(6));

      setFormLat(lat);
      setFormLng(lng);
      setFormOpen(true);
      setEditingId(null);
      setFormError(null);

      // Place or move draft marker
      if (!draftMarkerRef.current) {
        const el = document.createElement("div");
        el.className =
          "flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent bg-surface font-mono text-sm shadow-xl animate-bounce";
        el.textContent = "📍";
        draftMarkerRef.current = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);

        draftMarkerRef.current.on("dragend", () => {
          const pos = draftMarkerRef.current?.getLngLat();
          if (pos) {
            setFormLat(Number(pos.lat.toFixed(6)));
            setFormLng(Number(pos.lng.toFixed(6)));
          }
        });
      } else {
        draftMarkerRef.current.setLngLat([lng, lat]);
      }
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  // Render geofences & markers on map
  useEffect(() => {
    if (!map) return;

    // Clear old markers
    for (const m of placeMarkersRef.current) m.remove();
    placeMarkersRef.current = [];

    // Add place markers
    for (const p of places) {
      const el = document.createElement("div");
      el.className =
        "flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-[#0f1420]/90 px-2 py-1 text-xs font-medium text-[#e7ecf6] shadow-md backdrop-blur transition-transform hover:scale-105";
      el.innerHTML = `<span>${iconForPlace(p.icon)}</span><span>${p.name}</span>`;

      el.onclick = (e) => {
        e.stopPropagation();
        startEdit(p);
      };

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      placeMarkersRef.current.push(marker);
    }

    // Build GeoJSON polygons for places
    const features = places.map((p) => ({
      type: "Feature" as const,
      properties: { id: p.id, name: p.name },
      geometry: {
        type: "Polygon" as const,
        coordinates: [createCirclePolygon(p.lat, p.lng, p.radiusM)],
      },
    }));

    // If form is open and has coordinates, add draft circle preview
    if (formOpen && typeof formLat === "number" && typeof formLng === "number") {
      features.push({
        type: "Feature" as const,
        properties: { id: "draft", name: "Draft Place" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [createCirclePolygon(formLat, formLng, formRadius)],
        },
      });
    }

    const fc = { type: "FeatureCollection" as const, features };

    const src = map.getSource("places-circles") as maplibregl.GeoJSONSource | undefined;
    if (!src) {
      map.addSource("places-circles", { type: "geojson", data: fc as any });
      map.addLayer({
        id: "places-fill",
        type: "fill",
        source: "places-circles",
        paint: {
          "fill-color": "#ffae3c",
          "fill-opacity": 0.1,
        },
      });
      map.addLayer({
        id: "places-line",
        type: "line",
        source: "places-circles",
        paint: {
          "line-color": "#ffae3c",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
          "line-opacity": 0.6,
        },
      });
    } else {
      src.setData(fc as any);
    }
  }, [map, places, formOpen, formLat, formLng, formRadius]);

  function startCreate() {
    setEditingId(null);
    setFormName("");
    setFormIcon("pin");
    setFormRadius(100);
    setFormNotifyEnter(true);
    setFormNotifyLeave(true);
    setFormError(null);
    setFormOpen(true);

    if (map) {
      const center = map.getCenter();
      setFormLat(Number(center.lat.toFixed(6)));
      setFormLng(Number(center.lng.toFixed(6)));

      if (!draftMarkerRef.current) {
        const el = document.createElement("div");
        el.className =
          "flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent bg-surface font-mono text-sm shadow-xl";
        el.textContent = "📍";
        draftMarkerRef.current = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([center.lng, center.lat])
          .addTo(map);

        draftMarkerRef.current.on("dragend", () => {
          const pos = draftMarkerRef.current?.getLngLat();
          if (pos) {
            setFormLat(Number(pos.lat.toFixed(6)));
            setFormLng(Number(pos.lng.toFixed(6)));
          }
        });
      } else {
        draftMarkerRef.current.setLngLat([center.lng, center.lat]);
      }
    }
  }

  function startEdit(p: PlaceItem) {
    setEditingId(p.id);
    setFormName(p.name);
    setFormIcon(p.icon);
    setFormLat(p.lat);
    setFormLng(p.lng);
    setFormRadius(p.radiusM);
    setFormNotifyEnter(p.notifyOnEnter);
    setFormNotifyLeave(p.notifyOnLeave);
    setFormError(null);
    setFormOpen(true);

    if (map) {
      map.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 600 });
      if (!draftMarkerRef.current) {
        const el = document.createElement("div");
        el.className =
          "flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent bg-surface font-mono text-sm shadow-xl";
        el.textContent = "📍";
        draftMarkerRef.current = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([p.lng, p.lat])
          .addTo(map);

        draftMarkerRef.current.on("dragend", () => {
          const pos = draftMarkerRef.current?.getLngLat();
          if (pos) {
            setFormLat(Number(pos.lat.toFixed(6)));
            setFormLng(Number(pos.lng.toFixed(6)));
          }
        });
      } else {
        draftMarkerRef.current.setLngLat([p.lng, p.lat]);
      }
    }
  }

  function cancelForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
    if (draftMarkerRef.current) {
      draftMarkerRef.current.remove();
      draftMarkerRef.current = null;
    }
  }

  async function savePlace() {
    if (!formName.trim()) {
      setFormError("Place name is required.");
      return;
    }
    if (typeof formLat !== "number" || typeof formLng !== "number") {
      setFormError("Valid coordinates are required. Click on the map to set.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        name: formName.trim(),
        icon: formIcon,
        lat: formLat,
        lng: formLng,
        radiusM: formRadius,
        notifyOnEnter: formNotifyEnter,
        notifyOnLeave: formNotifyLeave,
      };

      let res: Response;
      if (editingId) {
        res = await fetch("/api/places", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
      } else {
        res = await fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      cancelForm();
      await loadPlaces();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deletePlace(id: string, name: string) {
    if (!confirm(`Delete place "${name}"?`)) return;
    try {
      const res = await fetch(`/api/places?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        if (editingId === id) cancelForm();
        await loadPlaces();
      }
    } catch {}
  }

  const fieldCls =
    "w-full rounded-md border border-line bg-raised px-2.5 py-1.5 font-mono text-xs text-ink outline-none transition-colors focus:border-accent/70";

  return (
    <div className="flex h-full flex-col-reverse lg:flex-row">
      {/* Places Sidebar */}
      <aside className="shrink-0 border-line bg-surface max-lg:border-t lg:h-full lg:w-96 lg:overflow-y-auto lg:border-r lg:border-t-0 scroll-slim">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h1 className="eyebrow">Named Places</h1>
            <p className="font-mono text-[11px] text-faint">{places.length} geofences defined</p>
          </div>
          {!formOpen && (
            <button
              onClick={startCreate}
              className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-bg transition-[filter] hover:brightness-110"
            >
              <span>+ Add Place</span>
            </button>
          )}
        </div>

        {/* Place Creation / Edit Form */}
        {formOpen && (
          <div className="border-b border-line bg-raised/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="eyebrow text-accent">
                {editingId ? "Edit Geofence" : "New Geofence"}
              </h2>
              <button
                onClick={cancelForm}
                className="font-mono text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-[11px] text-faint">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Home, Office, Gym"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[11px] text-faint">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_ICONS.map((i) => (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => setFormIcon(i.key)}
                      className={`flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors ${
                        formIcon === i.key
                          ? "border-accent bg-accent/15 text-ink"
                          : "border-line bg-surface text-muted hover:border-faint/60"
                      }`}
                    >
                      <span>{iconForPlace(i.key)}</span>
                      <span className="text-[10px]">{i.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-mono text-[11px] text-faint">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formLat}
                    onChange={(e) => setFormLat(e.target.value ? Number(e.target.value) : "")}
                    className={fieldCls}
                    placeholder="Click on map"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[11px] text-faint">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formLng}
                    onChange={(e) => setFormLng(e.target.value ? Number(e.target.value) : "")}
                    className={fieldCls}
                    placeholder="Click on map"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-mono text-[11px] text-faint">Geofence Radius</label>
                  <span className="font-mono text-xs text-accent">{formRadius} m</span>
                </div>
                <input
                  type="range"
                  min="25"
                  max="1000"
                  step="25"
                  value={formRadius}
                  onChange={(e) => setFormRadius(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={formNotifyEnter}
                    onChange={(e) => setFormNotifyEnter(e.target.checked)}
                    className="accent-accent"
                  />
                  <span>Notify on arrival</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={formNotifyLeave}
                    onChange={(e) => setFormNotifyLeave(e.target.checked)}
                    className="accent-accent"
                  />
                  <span>Notify on departure</span>
                </label>
              </div>

              {formError && (
                <p className="rounded border border-danger/40 bg-danger/10 px-2.5 py-1.5 font-mono text-xs text-danger">
                  {formError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={savePlace}
                  disabled={saving}
                  className="flex-1 rounded bg-accent py-2 font-display text-xs font-semibold uppercase tracking-wider text-bg transition-[filter] hover:brightness-110 disabled:opacity-40"
                >
                  {saving ? "Saving…" : editingId ? "Update Place" : "Create Place"}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="rounded border border-line bg-surface px-3 py-2 font-display text-xs font-medium uppercase tracking-wider text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Places List */}
        <div className="p-3">
          {loading && <p className="p-3 font-mono text-xs text-muted">Loading places…</p>}

          {!loading && places.length === 0 && !formOpen && (
            <div className="rounded-lg border border-dashed border-line p-4 text-center">
              <p className="text-xs leading-relaxed text-muted">
                No places defined yet.
              </p>
              <p className="mt-1 font-mono text-[11px] text-faint">
                Click anywhere on the map or use &quot;+ Add Place&quot; to define your first geofence.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {places.map((p) => (
              <li
                key={p.id}
                className="group rounded-lg border border-line bg-raised p-3 transition-colors hover:border-faint/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      if (map) map.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 600 });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{iconForPlace(p.icon)}</span>
                      <span className="font-medium text-ink text-sm">{p.name}</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      radius {p.radiusM}m · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      onClick={() => startEdit(p)}
                      className="rounded border border-line p-1 text-muted transition-colors hover:border-faint hover:text-ink"
                      title="Edit place"
                      aria-label="Edit place"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
                        <path d="M13.5 3.5 16.5 6.5M4 16h3l9-9-3-3-9 9v3Z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deletePlace(p.id, p.name)}
                      className="rounded border border-line p-1 text-muted transition-colors hover:border-danger hover:text-danger"
                      title="Delete place"
                      aria-label="Delete place"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
                        <path d="M4 6h12M7 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Occupants Indicator */}
                {p.occupants && p.occupants.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-1.5 rounded border border-ok/30 bg-ok/10 px-2 py-1 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                    <span className="font-mono text-[11px] text-ok">
                      Currently here: {p.occupants.map((o) => o.name).join(", ")}
                    </span>
                  </div>
                )}

                {/* Notification status indicators */}
                <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-faint">
                  <span>Enter: {p.notifyOnEnter ? "🔔" : "🔕"}</span>
                  <span>Leave: {p.notifyOnLeave ? "🔔" : "🔕"}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Map */}
      <div className="relative min-h-0 flex-1">
        <MapView className="h-full w-full" onReady={(m) => setMap(m)} />
        <div className="hud-chip pointer-events-none absolute left-3 top-3 z-10 px-3 py-1.5 font-mono text-[11px] text-muted">
          Click map to place pin · Drag pin to adjust
        </div>
      </div>
    </div>
  );
}
