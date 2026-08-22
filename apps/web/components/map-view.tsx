"use client";

import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import { PMTILES_URL, osmRasterStyle, resolveStyle, type StyleAndOffline } from "@/lib/map-style";

let protocolRegistered = false;

function registerProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

interface MapViewProps {
  /**
   * Sizing classes for the map root — must give it a real height, e.g. "h-full w-full".
   * The map target itself is sized in-flow (h-full w-full); never position it with
   * Tailwind utilities: maplibre-gl.css is unlayered, so `.maplibregl-map{position:relative}`
   * always overrides layered utilities like `.absolute`.
   */
  className?: string;
  onReady?: (map: MlMap) => void;
  onFallback?: () => void;
}

export function MapView({ className, onReady, onFallback }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: MlMap | null = null;
    let disposed = false;

    function boot(styleAndOffline: StyleAndOffline) {
      if (disposed || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: styleAndOffline.style,
        center: [
          Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? 77.5946),
          Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 12.9716),
        ],
        zoom: Number(process.env.NEXT_PUBLIC_MAP_ZOOM ?? 11),
        attributionControl: { compact: true },
      });
      // Debug hook (also used by headless smoke tests).
      (window as unknown as Record<string, unknown>).__gltmap = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.ScaleControl(), "bottom-left");

      map.on("load", () => {
        if (disposed || !map) return;
        setStatus({ kind: "ok", text: "" });
        onReady?.(map);
      });

      map.on("error", (e) => {
        if (disposed || !map) return;
        const err = e as unknown as { sourceId?: string; message?: string };
        const msg = String(e?.error?.message ?? err.message ?? "");
        // Offline archive broken at runtime -> rebuild once with online OSM raster.
        if (
          styleAndOffline.offline &&
          !styleAndOffline.fellBack &&
          (err.sourceId === "protomaps" || msg.includes(PMTILES_URL))
        ) {
          styleAndOffline.fellBack = true;
          map.remove();
          setStatus({ kind: "warn", text: "offline basemap failed — using online OSM tiles" });
          onFallback?.();
          boot({ style: osmRasterStyle(), offline: false });
          return;
        }
        if (!msg) return;
        setStatus({ kind: "error", text: `${msg.slice(0, 160)} — check browser console (F12)` });
      });
    }

    registerProtocol();
    resolveStyle()
      .then((styleAndOffline) => {
        if (!styleAndOffline.offline) onFallback?.();
        boot(styleAndOffline);
      })
      .catch((err) => {
        setStatus({ kind: "error", text: `init failed: ${String(err).slice(0, 140)}` });
      });

    return () => {
      disposed = true;
      map?.remove();
      map = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      {status && status.kind === "warn" && (
        <div className="pointer-events-none absolute bottom-2 right-2 max-w-[420px] rounded-md bg-amber-950/90 px-3 py-1.5 text-xs text-amber-200">
          {status.text}
        </div>
      )}
      {status && status.kind === "error" && (
        <div className="absolute bottom-2 right-2 max-w-[420px] truncate rounded-md bg-red-950/90 px-3 py-1.5 text-xs text-red-200">
          {status.text}
        </div>
      )}
      {!status && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-400">
          loading basemap...
        </div>
      )}
    </div>
  );
}
