"use client";

import type { FeatureCollection, LineString, Point } from "geojson";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapView } from "@/components/map-view";
import {
  colorFor,
  createCirclePolygon,
  daysAgoISO,
  detectStops,
  escapeHtml,
  formatClock,
  formatDateTime,
  formatDuration,
  generateGeoJson,
  generateGpx,
  haversineMeters,
  interpolateAt,
  parseLocalDateTime,
  todayISO,
  type PlaceSummary,
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
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [from, setFrom] = useState("00:00");
  const [to, setTo] = useState("23:59");
  const [preset, setPreset] = useState<"today" | "yesterday" | "last7d" | "custom">("today");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
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

  const fromMs = useMemo(() => parseLocalDateTime(startDate, from) ?? 0, [startDate, from]);
  const toMs = useMemo(() => parseLocalDateTime(endDate, to) ?? Date.now(), [endDate, to]);
  const isMultiDay = startDate !== endDate;

  function applyPreset(p: "today" | "yesterday" | "last7d") {
    setPreset(p);
    if (p === "today") {
      const t = todayISO();
      setStartDate(t);
      setEndDate(t);
      setFrom("00:00");
      setTo("23:59");
    } else if (p === "yesterday") {
      const y = daysAgoISO(1);
      setStartDate(y);
      setEndDate(y);
      setFrom("00:00");
      setTo("23:59");
    } else if (p === "last7d") {
      setStartDate(daysAgoISO(6));
      setEndDate(todayISO());
      setFrom("00:00");
      setTo("23:59");
    }
  }

  function handleExport(format: "gpx" | "geojson") {
    setShowExportMenu(false);
    if (tracks.length === 0) return;
    const suffix = `${startDate}${startDate !== endDate ? `-to-${endDate}` : ""}`;
    if (format === "gpx") {
      const xml = generateGpx(tracks, `GPS Tracks ${startDate} to ${endDate}`);
      const blob = new Blob([xml], { type: "application/gpx+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gpstracks-${suffix}.gpx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const geojson = generateGeoJson(tracks);
      const blob = new Blob([JSON.stringify(geojson, null, 2)], {
        type: "application/geo+json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gpstracks-${suffix}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [pRes, plRes] = await Promise.all([
          fetch("/api/persons", { cache: "no-store" }),
          fetch("/api/places", { cache: "no-store" }),
        ]);
        if (pRes.ok) {
          const rows = (await pRes.json()) as PersonRow[];
          setPersons(rows);
          setSelected(new Set(rows.map((r) => r.id)));
        }
        if (plRes.ok) {
          setPlaces(await plRes.json());
        }
      } catch {}
    }
    load();
  }, []);

  useEffect(() => {
    if (!startDate || !endDate || persons.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ startDate, endDate, from, to });
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
              stops: detectStops(tr.points, 75, 10, places),
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
  }, [startDate, endDate, from, to, selected, persons, places]);

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
          "line-opacity": 0.4,
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
          "circle-stroke-color": "#0a0e16",
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
    pts?.setData(showPoints ? pointFeatures(tracks) : EMPTY_FC);

    for (const m of stopMarkersRef.current) m.remove();
    stopMarkersRef.current = [];

    for (const t of tracks) {
      for (const s of t.stops) {
        const el = document.createElement("div");
        el.className =
          "flex h-5 w-5 items-center justify-center rounded-full border-2 bg-[#e7ecf6] font-mono text-[10px] font-medium text-[#0a0e16] shadow";
        el.style.borderColor = t.color;
        el.textContent = String(s.index);
        const stopHeader = s.placeName
          ? `<strong>Stop ${s.index} · ${escapeHtml(s.placeName)}</strong>`
          : `<strong>Stop ${s.index}</strong>`;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([s.lng, s.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 12 }).setHTML(
              `${stopHeader}<br/>${escapeHtml(t.name)}<br/>` +
                `<span style="font-family:'IBM Plex Mono',monospace;color:#8b96ac">${formatClock(s.start)} – ${formatClock(s.end)} (${formatDuration(s.end - s.start)})</span>`,
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
    if (!map || places.length === 0) return;

    const fc = {
      type: "FeatureCollection",
      features: places.map((p) => ({
        type: "Feature",
        properties: { id: p.id, name: p.name, icon: p.icon },
        geometry: {
          type: "Polygon",
          coordinates: [createCirclePolygon(p.lat, p.lng, p.radiusM)],
        },
      })),
    };

    const src = map.getSource("places-circles") as maplibregl.GeoJSONSource | undefined;
    if (!src) {
      map.addSource("places-circles", { type: "geojson", data: fc as any });
      map.addLayer({
        id: "places-fill",
        type: "fill",
        source: "places-circles",
        paint: {
          "fill-color": "#ffae3c",
          "fill-opacity": 0.08,
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
          "line-opacity": 0.45,
        },
      });
    } else {
      src.setData(fc as any);
    }
  }, [map, places]);

  // showPoints toggles without refetching — just repaint.
  useEffect(() => {
    if (!map) return;
    const pts = map.getSource("points") as maplibregl.GeoJSONSource | undefined;
    pts?.setData(showPoints ? pointFeatures(tracks) : EMPTY_FC);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPoints]);

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
      el.className = "relative flex h-4 w-4 items-center justify-center";
      el.style.color = t.color;
      const ping = document.createElement("span");
      ping.className = "fix-ping";
      const dot = document.createElement("span");
      dot.className = "h-3.5 w-3.5 rounded-full border-2 shadow-lg";
      dot.style.backgroundColor = t.color;
      dot.style.borderColor = "rgba(231,236,246,0.92)";
      el.appendChild(ping);
      el.appendChild(dot);
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

  const fieldCls =
    "rounded-md border border-line bg-raised px-2 py-1.5 font-mono text-xs text-ink outline-none transition-colors focus:border-accent/70";

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5">
        {/* Quick Presets */}
        <div className="flex items-center rounded-md border border-line bg-raised p-0.5">
          {(["today", "yesterday", "last7d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`rounded px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                preset === p
                  ? "bg-surface text-accent shadow-xs"
                  : "text-muted hover:text-ink"
              }`}
            >
              {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : "7 Days"}
            </button>
          ))}
        </div>

        {/* Date bounds */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPreset("custom");
            }}
            className={fieldCls}
            title="Start date"
          />
          <span className="font-mono text-xs text-faint">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPreset("custom");
            }}
            className={fieldCls}
            title="End date"
          />
        </div>

        {/* Time bounds */}
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            className={fieldCls}
            title="Window start"
          />
          <span className="font-mono text-xs text-faint">→</span>
          <input
            type="time"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            className={fieldCls}
            title="Window end"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(e) => setShowPoints(e.target.checked)}
            className="accent-accent"
          />
          raw points
        </label>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={tracks.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:border-faint/60 hover:text-ink disabled:opacity-40"
            title="Export tracks"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
              <path d="M10 3v9m0 0 3-3m-3 3-3-3M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Export</span>
            <span className="text-[9px]">▾</span>
          </button>
          {showExportMenu && (
            <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-xl">
              <button
                onClick={() => handleExport("gpx")}
                className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left font-mono text-xs text-ink transition-colors hover:bg-raised"
              >
                <span>Export GPX</span>
                <span className="text-[10px] text-faint">.gpx</span>
              </button>
              <button
                onClick={() => handleExport("geojson")}
                className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left font-mono text-xs text-ink transition-colors hover:bg-raised"
              >
                <span>Export GeoJSON</span>
                <span className="text-[10px] text-faint">.geojson</span>
              </button>
            </div>
          )}
        </div>
        <div className="ml-auto flex max-w-full items-center gap-1.5 scroll-slim max-lg:w-full max-lg:overflow-x-auto lg:overflow-visible lg:pb-0">
          {persons.length === 0 && (
            <span className="font-mono text-[11px] text-faint">no persons tracked yet</span>
          )}
          {persons.map((p) => {
            const active = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePerson(p.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-faint/60 bg-raised text-ink"
                    : "border-line bg-transparent text-faint hover:text-muted"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full transition-opacity"
                  style={{ backgroundColor: active ? colorFor(p.id) : "#5a6579" }}
                />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div className="relative min-h-0 flex-1">
        <MapView
          className="h-full w-full"
          onReady={(m) => {
            setupLayers(m);
            setMap(m);
          }}
        />

        {/* Left telemetry stack */}
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[230px] flex-col items-start gap-1.5">
          {loading && (
            <div className="hud-chip pointer-events-auto px-3 py-1.5 font-mono text-[11px] text-muted">
              Loading tracks…
            </div>
          )}
          {error && (
            <div className="hud-chip pointer-events-auto border-danger/40 px-3 py-1.5 font-mono text-[11px] text-danger">
              {error}
            </div>
          )}
          {tracks.map((t) => (
            <div key={t.personId} className="hud-chip pointer-events-auto px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted">
                {t.km.toFixed(1)} km · {t.points.length} pts · {t.stops.length} stops
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transport deck */}
      <div className="flex shrink-0 items-center gap-2.5 border-t border-line bg-surface px-3 py-2 sm:gap-3 md:px-4">
        <button
          onClick={() => {
            if (cursorMs != null && cursorMs >= toMs) setCursorMs(fromMs);
            setPlaying((p) => !p);
          }}
          disabled={tracks.length === 0}
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-[filter,opacity] hover:brightness-110 disabled:opacity-30"
        >
          {playing ? (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <rect x="5" y="4" width="3.4" height="12" rx="1" />
              <rect x="11.6" y="4" width="3.4" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" className="h-4 w-4 translate-x-px" fill="currentColor">
              <path d="M6 4.5v11a.7.7 0 0 0 1.07.6l8.6-5.5a.7.7 0 0 0 0-1.2l-8.6-5.5A.7.7 0 0 0 6 4.5Z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setCursorMs(null);
          }}
          title="Reset playback"
          aria-label="Reset playback"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-faint/60 hover:text-ink disabled:opacity-30"
          disabled={tracks.length === 0}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
            <path d="M4 10a6 6 0 1 0 1.76-4.24" strokeLinecap="round" />
            <path d="M4 3v3.2h3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
          className="h-1.5 min-w-0 flex-1 accent-accent"
          disabled={tracks.length === 0}
          aria-label="Timeline position"
        />
        <span className="min-w-16 shrink-0 text-right font-mono text-xs tabular-nums text-ink sm:min-w-24 sm:text-sm">
          {cursorMs == null ? (
            <span className="text-faint">--:--</span>
          ) : isMultiDay ? (
            formatDateTime(cursorMs)
          ) : (
            formatClock(cursorMs)
          )}
        </span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className={`${fieldCls} shrink-0 px-1.5`}
          aria-label="Playback speed"
        >
          {[1, 60, 300, 900, 1800, 3600].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
