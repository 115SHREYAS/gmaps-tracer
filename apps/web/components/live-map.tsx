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
    `<span style="font-family:'IBM Plex Mono',monospace;color:#8b96ac">${formatRelative(new Date(e.recordedAt).getTime())}</span>`,
    battery ? `<span style="color:#8b96ac">${battery}</span>` : "",
    e.accuracyM != null
      ? `<span style="color:#8b96ac">accuracy ±${Math.round(e.accuracyM)}m</span>`
      : "",
  ]
    .filter(Boolean)
    .join("<br/>");
}

function Avatar({ entry, size }: { entry: LiveEntry; size: string }) {
  const color = colorFor(entry.id);
  if (entry.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.photoUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`${size} shrink-0 rounded-full object-cover`}
        style={{ boxShadow: `0 0 0 2px #0f1420, 0 0 0 3.5px ${color}` }}
      />
    );
  }
  const initial = entry.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full font-display text-xs font-semibold`}
      style={{
        backgroundColor: `${color}26`,
        color,
        boxShadow: `0 0 0 2px #0f1420, 0 0 0 3.5px ${color}`,
      }}
    >
      {initial}
    </span>
  );
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
        el.className = "relative flex cursor-pointer items-center gap-1.5";

        // Radar ping behind the dot — fresh fixes only.
        const dotWrap = document.createElement("span");
        dotWrap.className = "relative flex h-4 w-4 items-center justify-center";
        dotWrap.style.color = colorFor(e.id);
        const dot = document.createElement("span");
        dot.className = "h-3 w-3 rounded-full border-2 shadow-md";
        dot.style.backgroundColor = colorFor(e.id);
        dot.style.borderColor = "rgba(231,236,246,0.92)";
        if (Date.now() - new Date(e.recordedAt).getTime() <= STALE_AFTER_MS) {
          const ping = document.createElement("span");
          ping.className = "fix-ping";
          dotWrap.appendChild(ping);
        }
        dotWrap.appendChild(dot);

        const label = document.createElement("span");
        label.className =
          "rounded border border-[#212a3c] bg-[#0f1420]/90 px-1.5 py-0.5 text-[11px] font-medium text-[#e7ecf6] backdrop-blur-sm";
        label.textContent = e.name;

        el.appendChild(dotWrap);
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
        if (label && label.textContent !== e.name) label.textContent = e.name;
        const popup = marker.getPopup();
        if (popup?.isOpen()) popup.setHTML(popupHtml(e));
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
    <div className="flex h-full flex-col-reverse lg:flex-row">
      {/* Position rail — horizontal card strip on mobile, sidebar on desktop */}
      <aside className="shrink-0 border-line bg-surface max-lg:border-t lg:h-full lg:w-80 lg:overflow-y-auto lg:border-r lg:border-t-0 scroll-slim">
        <div className="flex items-baseline justify-between px-4 pt-3">
          <h2 className="eyebrow">Live positions · {entries.length}</h2>
          <span className="font-mono text-[10px] text-faint">REFRESH 30S</span>
        </div>

        {!loaded && (
          <p className="px-4 py-3 font-mono text-xs text-muted">Loading…</p>
        )}
        {loaded && entries.length === 0 && (
          <div className="mx-4 mb-4 mt-3 rounded-lg border border-dashed border-line p-3">
            <p className="text-xs leading-relaxed text-muted">
              No fixes yet. Upload your Google cookies.txt in Settings and wait
              for the first poll.
            </p>
          </div>
        )}

        <ul className="flex gap-2.5 p-3 pt-2.5 scroll-slim max-lg:snap-x max-lg:overflow-x-auto lg:flex-col lg:gap-2">
          {entries.map((e) => {
            const stale = now - new Date(e.recordedAt).getTime() > STALE_AFTER_MS;
            return (
              <li
                key={e.id}
                className="w-56 shrink-0 rounded-lg border border-line bg-raised p-3 transition-colors hover:border-faint/50 max-lg:snap-start lg:w-auto"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar entry={e} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{e.name}</span>
                      {stale && (
                        <span className="ml-auto shrink-0 rounded border border-accent/40 px-1 py-px font-mono text-[9px] uppercase tracking-wider text-accent">
                          stale
                        </span>
                      )}
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted">
                      {formatRelative(new Date(e.recordedAt).getTime())}
                    </p>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-snug text-muted">
                  {e.address ?? "unknown address"}
                </p>
                <p className="mt-1.5 font-mono text-[10px] text-faint">
                  {e.batteryPct != null && `${e.batteryPct}%${e.charging ? " ⚡" : ""}`}
                  {e.batteryPct != null && e.accuracyM != null && " · "}
                  {e.accuracyM != null && `±${Math.round(e.accuracyM)}m`}
                </p>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="relative min-h-0 flex-1">
        <MapView
          className="h-full w-full"
          onReady={(m) => setMap(m)}
          onFallback={() => setOfflineTiles(false)}
        />
        {!offlineTiles && loaded && (
          <div className="hud-chip absolute bottom-2 left-2 z-10 max-w-[calc(100%-1rem)] px-3 py-1.5 font-mono text-[11px] text-accent">
            Offline basemap missing — using online OSM tiles. Run
            scripts/build-tiles.sh to enable offline mode.
          </div>
        )}
      </div>
    </div>
  );
}
