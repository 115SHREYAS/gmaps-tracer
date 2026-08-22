"use client";

import type { FeatureCollection, LineString, Point } from "geojson";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapView } from "@/components/map-view";
import {
  colorFor,
  detectStops,
  escapeHtml,
  formatClock,
  formatDateTime,
  formatDuration,
  haversineMeters,
  interpolateAt,
  parseLocalDateTime,
  todayISO,
  type StopInfo,
  type TrackPoint,
} from "@/lib/geo";

interface PersonRow {
  id: string;
  name: string;
}

interface ApiTrack {
  personId: string;
  points: TrackPoint[];
}

interface Track {
  personId: string;
  name: string;
  color: string;
  points: TrackPoint[];
  stops: StopInfo[];
  km: number;
}

const EMPTY_FC: FeatureCollection<LineString | Point> = { type: "FeatureCollection", features: [] };

function trackKm(points: TrackPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return d / 1000;
}

function pathFeatures(tracks: Track[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: tracks
      .filter((t) => t.points.length >= 2)
      .map((t) => ({
        type: "Feature" as const,
        properties: { color: t.color },
        geometry: {
          type: "LineString" as const,
          coordinates: t.points.map((p) => [p.lng, p.lat]),
        },
      })),
  };
}

function pointFeatures(tracks: Track[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: tracks.flatMap((t) =>
      t.points.map((p) => ({
        type: "Feature" as const,
        properties: { color: t.color },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    ),
  };
}

function traveledFeatures(tracks: Track[], cursor: number): FeatureCollection<LineString> {
  const features = tracks
    .map((t) => {
      const before = t.points.filter((p) => p.t <= cursor);
      const tip = interpolateAt(t.points, cursor);
      if (!tip) return null;
      const coords: [number, number][] = [
        ...before.map((p) => [p.lng, p.lat] as [number, number]),
        [tip.lng, tip.lat],
      ];
      if (coords.length < 2) return null;
      return {
        type: "Feature" as const,
        properties: { color: t.color },
        geometry: { type: "LineString" as const, coordinates: coords },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  return { type: "FeatureCollection", features };
}

export function HistoryView() {
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(todayISO());
  const [from, setFrom] = useState("00:00");
  const [to, setTo] = useState("23:59");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPoints, setShowPoints] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [cursorMs, setCursorMs] = useState<number | null>(null);

  const [map, setMap] = useState<MlMap | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const playMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const fromMs = useMemo(() => parseLocalDateTime(date, from) ?? 0, [date, from]);
  const toMs = useMemo(() => parseLocalDateTime(date, to) ?? Date.now(), [date, to]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/persons", { cache: "no-store" });
        if (!res.ok) return;
        const rows = (await res.json()) as PersonRow[];
        setPersons(rows);
        setSelected(new Set(rows.map((r) => r.id)));
      } catch {}
    }
    load();
  }, []);

  useEffect(() => {
    if (!date || persons.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ date, from, to });
        if (selected.size > 0) qs.set("persons", [...selected].join(","));
        const res = await fetch(`/api/locations?${qs.toString()}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { tracks: ApiTrack[] };
        const byId = new Map(persons.map((p) => [p.id, p]));
        const merged: Track[] = data.tracks
          .map((tr) => {
            const meta = byId.get(tr.personId);
            return {
              personId: tr.personId,
              name: meta?.name ?? tr.personId.slice(0, 8),
              color: colorFor(tr.personId),
              points: tr.points,
              stops: detectStops(tr.points),
              km: trackKm(tr.points),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setTracks(merged);
        setPlaying(false);
        setCursorMs(null);
      } catch (err) {
        if (!ctrl.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          setTracks([]);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [date, from, to, selected, persons]);

  const setupLayers = useCallback((m: MlMap) => {
    if (!m.getSource("paths")) {
      m.addSource("paths", { type: "geojson", data: EMPTY_FC });
      m.addLayer({
        id: "paths-line",
        type: "line",
        source: "paths",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": 0.45,
        },
      });
    }
    if (!m.getSource("traveled")) {
      m.addSource("traveled", { type: "geojson", data: EMPTY_FC });
      m.addLayer({
        id: "traveled-line",
        type: "line",
        source: "traveled",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4.5,
          "line-opacity": 0.95,
        },
      });
    }
    if (!m.getSource("points")) {
      m.addSource("points", { type: "geojson", data: EMPTY_FC });
      m.addLayer({
        id: "points-circle",
        type: "circle",
        source: "points",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 3.5,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        },
      });
    }
  }, []);

  useEffect(() => {
    if (!map) return;

    const src = map.getSource("paths") as maplibregl.GeoJSONSource | undefined;
    src?.setData(pathFeatures(tracks));
    const pts = map.getSource("points") as maplibregl.GeoJSONSource | undefined;
    pts?.setData(pointFeatures(tracks));

    for (const m of stopMarkersRef.current) m.remove();
    stopMarkersRef.current = [];

    for (const t of tracks) {
      for (const s of t.stops) {
        const el = document.createElement("div");
        el.className =
          "flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white text-[10px] font-bold text-neutral-900 shadow";
        el.style.borderColor = t.color;
        el.textContent = String(s.index);
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([s.lng, s.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 12 }).setHTML(
              `<strong>Stop ${s.index}</strong><br/>${escapeHtml(t.name)}<br/>` +
                `${formatClock(s.start)} – ${formatClock(s.end)} (${formatDuration(s.end - s.start)})`,
            ),
          )
          .addTo(map);
        stopMarkersRef.current.push(marker);
      }
    }

    if (tracks.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      let any = false;
      for (const t of tracks) {
        for (const p of t.points) {
          bounds.extend([p.lng, p.lat]);
          any = true;
        }
      }
      if (any) map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 0 });
    }
  }, [map, tracks]);

  useEffect(() => {
    if (!map) return;

    const trav = map.getSource("traveled") as maplibregl.GeoJSONSource | undefined;
    trav?.setData(cursorMs == null ? EMPTY_FC : traveledFeatures(tracks, cursorMs));

    for (const marker of playMarkersRef.current.values()) marker.remove();
    playMarkersRef.current.clear();

    if (cursorMs == null) return;

    for (const t of tracks) {
      const pos = interpolateAt(t.points, cursorMs);
      if (!pos) continue;
      const el = document.createElement("div");
      el.className = "h-4 w-4 rounded-full border-2 border-white shadow-lg";
      el.style.backgroundColor = t.color;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map);
      playMarkersRef.current.set(t.personId, marker);
    }
  }, [map, tracks, cursorMs]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = now - prev;
      prev = now;
      setCursorMs((c) => {
        const base = c ?? fromMs;
        const next = base + dt * speed;
        if (next >= toMs) {
          setPlaying(false);
          return toMs;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, fromMs, toMs]);

  function togglePerson(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const inputCls =
    "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-sky-500";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2.5">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        <div className="flex items-center gap-1.5 text-sm text-neutral-400">
          <span>from</span>
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          <span>to</span>
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(e) => setShowPoints(e.target.checked)}
            className="accent-sky-500"
          />
          raw points
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {persons.length === 0 && (
            <span className="text-xs text-neutral-500">no persons tracked yet</span>
          )}
          {persons.map((p) => {
            const active = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePerson(p.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-neutral-600 bg-neutral-800 text-white"
                    : "border-neutral-800 bg-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: active ? colorFor(p.id) : "#525252" }}
                />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <MapView
          className="h-full w-full"
          onReady={(m) => {
            setupLayers(m);
            setMap(m);
          }}
        />

        {loading && (
          <div className="absolute left-2 top-2 rounded-md bg-neutral-900/90 px-3 py-1.5 text-xs text-neutral-300">
            Loading tracks...
          </div>
        )}
        {error && (
          <div className="absolute left-2 top-2 rounded-md bg-red-950/90 px-3 py-1.5 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="absolute right-2 top-2 max-w-[220px] space-y-1">
          {tracks.map((t) => (
            <div
              key={t.personId}
              className="rounded-md bg-neutral-900/90 px-2.5 py-1.5 text-xs shadow"
            >
              <div className="flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </div>
              <div className="mt-0.5 text-neutral-400">
                {t.km.toFixed(1)} km · {t.points.length} pts · {t.stops.length} stops
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-800 bg-neutral-900 px-4 py-2">
        <button
          onClick={() => {
            if (cursorMs != null && cursorMs >= toMs) setCursorMs(fromMs);
            setPlaying((p) => !p);
          }}
          disabled={tracks.length === 0}
          className="w-20 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setCursorMs(null);
          }}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:text-white"
        >
          Reset
        </button>
        <input
          type="range"
          min={fromMs}
          max={toMs}
          step={30_000}
          value={cursorMs ?? fromMs}
          onChange={(e) => {
            setPlaying(false);
            setCursorMs(Number(e.target.value));
          }}
          className="h-1.5 flex-1 accent-sky-500"
          disabled={tracks.length === 0}
        />
        <span className="w-14 text-right text-sm tabular-nums text-neutral-300">
          {cursorMs == null ? "--:--" : formatClock(cursorMs)}
        </span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none"
        >
          {[1, 60, 300, 900].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
