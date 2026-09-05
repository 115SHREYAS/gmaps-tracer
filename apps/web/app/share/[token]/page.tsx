"use client";

import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { MapView } from "@/components/map-view";
import { colorFor, formatRelative } from "@/lib/geo";

interface ShareData {
  valid: boolean;
  label?: string | null;
  expiresAt?: string | null;
  error?: string;
  expired?: boolean;
  person?: {
    id: string;
    name: string;
    photoUrl: string | null;
  };
  latestFix?: {
    lat: number;
    lng: number;
    accuracyM: number | null;
    address: string | null;
    batteryPct: number | null;
    charging: boolean | null;
    recordedAt: string;
  } | null;
  trail?: [number, number][];
}

export default function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [map, setMap] = useState<MlMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const fetchShared = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${token}`, { cache: "no-store" });
      const json = (await res.json()) as ShareData;
      setData(json);
    } catch {
      setData({ valid: false, error: "Network error loading shared location." });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchShared();
    const id = setInterval(fetchShared, 20_000);
    return () => clearInterval(id);
  }, [fetchShared]);

  // Update map marker and trail
  useEffect(() => {
    if (!map || !data || !data.latestFix || !data.person) return;

    const { lat, lng } = data.latestFix;
    const color = colorFor(data.person.id);

    // Trail source & layer
    const trailData = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: data.trail && data.trail.length > 0 ? data.trail : [[lng, lat]],
      },
    };

    const src = map.getSource("share-trail") as maplibregl.GeoJSONSource | undefined;
    if (!src) {
      map.addSource("share-trail", { type: "geojson", data: trailData });
      map.addLayer({
        id: "share-trail-line",
        type: "line",
        source: "share-trail",
        paint: {
          "line-color": color,
          "line-width": 3,
          "line-opacity": 0.6,
        },
      });
    } else {
      src.setData(trailData);
    }

    // Marker
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = "relative flex items-center gap-1.5";

      const dotWrap = document.createElement("span");
      dotWrap.className = "relative flex h-4 w-4 items-center justify-center";
      dotWrap.style.color = color;

      const ping = document.createElement("span");
      ping.className = "fix-ping";
      dotWrap.appendChild(ping);

      const dot = document.createElement("span");
      dot.className = "h-3 w-3 rounded-full border-2 border-white shadow-md";
      dot.style.backgroundColor = color;
      dotWrap.appendChild(dot);

      const label = document.createElement("span");
      label.className =
        "rounded border border-[#212a3c] bg-[#0f1420]/90 px-1.5 py-0.5 text-xs font-medium text-[#e7ecf6] shadow-md backdrop-blur-sm";
      label.textContent = data.person.name;

      el.appendChild(dotWrap);
      el.appendChild(label);

      markerRef.current = new maplibregl.Marker({ element: el, anchor: "left" })
        .setLngLat([lng, lat])
        .addTo(map);

      map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
  }, [map, data]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg font-mono text-xs text-muted">
        Loading shared location…
      </div>
    );
  }

  if (!data || !data.valid) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg p-4">
        <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger text-lg">
            ✕
          </div>
          <h1 className="font-display text-base font-semibold text-ink">
            {data?.expired ? "Share Link Expired" : "Invalid Share Link"}
          </h1>
          <p className="mt-2 text-xs text-muted leading-relaxed">
            {data?.error ?? "This location sharing link is no longer active."}
          </p>
        </div>
      </div>
    );
  }

  const { person, latestFix } = data;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      <MapView className="h-full w-full" onReady={(m) => setMap(m)} />

      {/* Floating Info HUD Card */}
      <div className="hud-chip pointer-events-auto absolute left-3 top-3 z-20 max-w-sm rounded-xl border border-line bg-surface/95 p-3.5 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          {person?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.photoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover shadow"
              style={{ boxShadow: `0 0 0 2px ${colorFor(person.id)}` }}
            />
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold text-bg shadow"
              style={{ backgroundColor: colorFor(person?.id ?? "1") }}
            >
              {person?.name.charAt(0) ?? "?"}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <h1 className="truncate font-display text-sm font-semibold text-ink">
                {person?.name}
              </h1>
              {data.label && (
                <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] text-accent">
                  {data.label}
                </span>
              )}
            </div>

            <p className="mt-0.5 font-mono text-[11px] text-muted">
              {latestFix
                ? `Updated ${formatRelative(new Date(latestFix.recordedAt).getTime())}`
                : "No fixes reported yet"}
            </p>
          </div>
        </div>

        {latestFix && (
          <div className="mt-2.5 border-t border-line/60 pt-2 text-xs text-muted">
            <p className="line-clamp-2 leading-relaxed text-ink/90">
              {latestFix.address ?? `${latestFix.lat.toFixed(4)}, ${latestFix.lng.toFixed(4)}`}
            </p>
            <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-faint">
              <span>
                {latestFix.batteryPct != null && (
                  <>Battery {latestFix.batteryPct}%{latestFix.charging ? " ⚡" : ""}</>
                )}
              </span>
              {latestFix.accuracyM != null && (
                <span>±{Math.round(latestFix.accuracyM)}m accuracy</span>
              )}
            </div>
          </div>
        )}

        <div className="mt-2 text-right">
          <span className="font-mono text-[9px] text-faint">
            GPS Location Tracer · Read-only
          </span>
        </div>
      </div>
    </div>
  );
}
