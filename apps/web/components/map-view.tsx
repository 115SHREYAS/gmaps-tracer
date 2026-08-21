"use client";

import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import { PMTILES_URL, resolveStyle } from "@/lib/map-style";

let protocolRegistered = false;

function registerProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

interface MapViewProps {
  className?: string;
  onReady?: (map: MlMap) => void;
  onFallback?: () => void;
}

export function MapView({ className, onReady, onFallback }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: MlMap | null = null;
    let disposed = false;

    registerProtocol();
    resolveStyle()
      .then(({ style, offline }) => {
        if (disposed || !containerRef.current) return;
        if (!offline) onFallback?.();

        map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: [
            Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? 77.5946),
            Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 12.9716),
          ],
          zoom: Number(process.env.NEXT_PUBLIC_MAP_ZOOM ?? 11),
          attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        map.addControl(new maplibregl.ScaleControl(), "bottom-left");
        map.on("load", () => {
          if (!disposed && map) onReady?.(map);
        });
        map.on("error", (e) => {
          const msg = e?.error?.message ?? "";
          if (msg.includes(PMTILES_URL)) setError("Offline basemap failed to load");
        });
      })
      .catch(() => setError("Could not initialize map"));

    return () => {
      disposed = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute bottom-2 right-2 rounded-md bg-red-950/90 px-3 py-1.5 text-xs text-red-200">
          {error} — run scripts/build-tiles.sh or set NEXT_PUBLIC_MAP_STYLE=osm
        </div>
      )}
    </div>
  );
}
