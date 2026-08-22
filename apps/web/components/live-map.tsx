"use client";

import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapView } from "@/components/map-view";
import {
  colorFor,
  escapeHtml,
  formatRelative,
  STALE_AFTER_MS,
} from "@/lib/geo";

interface LiveEntry {
  id: string;
  googleId: string;
  name: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  address: string | null;
  batteryPct: number | null;
  charging: boolean | null;
  recordedAt: string;
}

function popupHtml(e: LiveEntry): string {
  const battery =
    e.batteryPct != null ? `${e.batteryPct}%${e.charging ? " (charging)" : ""}` : "";
  return [
    `<strong>${escapeHtml(e.name)}</strong>`,
    e.address ? escapeHtml(e.address) : "",
    `${formatRelative(new Date(e.recordedAt).getTime())}`,
    battery,
    e.accuracyM != null ? `accuracy ±${Math.round(e.accuracyM)}m` : "",
  ]
    .filter(Boolean)
    .join("<br/>");
}

export function LiveDashboard() {
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offlineTiles, setOfflineTiles] = useState(true);
  // State (not just a ref) so the marker effect reruns once the map is ready,
  // even if /api/live resolved first.
  const [map, setMap] = useState<MlMap | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const fittedRef = useRef(false);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as LiveEntry[];
      setEntries(data);
    } catch {
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const id = setInterval(fetchLive, 30_000);
    return () => clearInterval(id);
  }, [fetchLive]);

  useEffect(() => {
    if (!map) return;

    const seen = new Set<string>();
    for (const e of entries) {
      seen.add(e.id);
      let marker = markersRef.current.get(e.id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "flex cursor-pointer items-center gap-1";
        const dot = document.createElement("span");
        dot.className = "h-3.5 w-3.5 rounded-full border-2 border-white shadow";
        dot.style.backgroundColor = colorFor(e.id);
        const label = document.createElement("span");
        label.className =
          "rounded bg-neutral-900/85 px-1.5 py-0.5 text-[11px] font-medium text-white";
        label.textContent = e.name;
        el.appendChild(dot);
        el.appendChild(label);
        marker = new maplibregl.Marker({ element: el, anchor: "left" })
          .setLngLat([e.lng, e.lat])
          .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(popupHtml(e)))
          .addTo(map);
        markersRef.current.set(e.id, marker);
      } else {
        marker.setLngLat([e.lng, e.lat]);
        const el = marker.getElement();
        const label = el.querySelector("span:last-child") as HTMLElement | null;
        if (label) label.textContent = e.name;
      }
    }
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (!fittedRef.current && entries.length > 0) {
      fittedRef.current = true;
      const bounds = new maplibregl.LngLatBounds();
      for (const e of entries) bounds.extend([e.lng, e.lat]);
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
    }
  }, [entries, map]);

  const now = Date.now();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      <aside className="w-full shrink-0 overflow-y-auto border-b border-neutral-800 bg-neutral-900 p-4 lg:h-full lg:w-80 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Live positions</h2>
          <span className="text-xs text-neutral-500">auto-refresh 30s</span>
        </div>
        {!loaded && <p className="text-sm text-neutral-500">Loading...</p>}
        {loaded && entries.length === 0 && (
          <p className="text-sm text-neutral-500">
            No data yet. Upload cookies in Settings and wait for the first poll.
          </p>
        )}
        <ul className="space-y-2">
          {entries.map((e) => {
            const stale = now - new Date(e.recordedAt).getTime() > STALE_AFTER_MS;
            return (
              <li
                key={e.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(e.id) }}
                  />
                  <span className="truncate text-sm font-medium">{e.name}</span>
                  {stale && (
                    <span className="ml-auto rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                      stale
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-400">
                  {e.address ?? "unknown address"}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {formatRelative(new Date(e.recordedAt).getTime())}
                  {e.batteryPct != null && ` · ${e.batteryPct}%${e.charging ? " charging" : ""}`}
                  {e.accuracyM != null && ` · ±${Math.round(e.accuracyM)}m`}
                </p>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="relative min-h-[50vh] flex-1">
        <MapView
          className="h-full w-full"
          onReady={(m) => setMap(m)}
          onFallback={() => setOfflineTiles(false)}
        />
        {!offlineTiles && loaded && (
          <div className="absolute bottom-2 left-2 rounded-md bg-amber-950/90 px-3 py-1.5 text-xs text-amber-200">
            Offline basemap missing — using online OSM tiles. Run scripts/build-tiles.sh to enable
            offline mode.
          </div>
        )}
      </div>
    </div>
  );
}
