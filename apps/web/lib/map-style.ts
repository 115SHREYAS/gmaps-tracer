import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export const PMTILES_URL = "/tiles/bangalore.pmtiles";

export function protomapsStyle(): StyleSpecification {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/sprites/v4/dark`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${origin}${PMTILES_URL}`,
        attribution: "© OpenStreetMap contributors © Protomaps",
      },
    },
    layers: layers("protomaps", namedFlavor("dark"), {
      lang: "en",
    }) as unknown as StyleSpecification["layers"],
  };
}

export function osmRasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

export interface StyleAndOffline {
  style: StyleSpecification;
  offline: boolean;
  /** Set once MapView has rebuilt itself on the OSM raster fallback. */
  fellBack?: boolean;
}

export async function resolveStyle(): Promise<StyleAndOffline> {
  if (process.env.NEXT_PUBLIC_MAP_STYLE !== "osm") {
    try {
      const res = await fetch(PMTILES_URL, { method: "HEAD", cache: "no-store" });
      if (res.ok) return { style: protomapsStyle(), offline: true };
    } catch {}
  }
  return { style: osmRasterStyle(), offline: false };
}
