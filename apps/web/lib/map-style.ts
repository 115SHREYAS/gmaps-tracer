import { layers, LIGHT } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export const PMTILES_URL = "/tiles/bangalore.pmtiles";

export function protomapsStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/fonts/v2/{fontstack}/{range}.pbf",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: "© OpenStreetMap contributors © Protomaps",
      },
    },
    layers: layers("protomaps", LIGHT) as unknown as StyleSpecification["layers"],
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

export async function resolveStyle(): Promise<{ style: StyleSpecification; offline: boolean }> {
  if (process.env.NEXT_PUBLIC_MAP_STYLE !== "osm") {
    try {
      const res = await fetch(PMTILES_URL, { method: "HEAD", cache: "no-store" });
      if (res.ok) return { style: protomapsStyle(), offline: true };
    } catch {}
  }
  return { style: osmRasterStyle(), offline: false };
}
