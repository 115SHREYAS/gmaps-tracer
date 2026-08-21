export interface TrackPoint {
  lat: number;
  lng: number;
  t: number;
  accuracyM?: number | null;
  address?: string | null;
  batteryPct?: number | null;
  charging?: boolean | null;
}

export interface StopInfo {
  lat: number;
  lng: number;
  start: number;
  end: number;
  index: number;
}

export const TZ_OFFSET = "+05:30";
export const TIME_ZONE_LABEL = "Asia/Kolkata";
export const STALE_AFTER_MS = 15 * 60 * 1000;

export const PERSON_COLORS = [
  "#38bdf8",
  "#f472b6",
  "#4ade80",
  "#fb923c",
  "#a78bfa",
  "#facc15",
  "#2dd4bf",
  "#f87171",
  "#c084fc",
  "#84cc16",
];

export function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[hash % PERSON_COLORS.length];
}

export function parseLocalDateTime(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = new Date(`${date}T${time}:00${TZ_OFFSET}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE_LABEL }).format(new Date());
}

const clockFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE_LABEL,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE_LABEL,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatClock(ms: number): string {
  return clockFmt.format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return dateTimeFmt.format(new Date(ms));
}

export function formatRelative(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return dateTimeFmt.format(new Date(ms));
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function detectStops(
  points: TrackPoint[],
  radiusM = 75,
  minDurationMin = 10,
): StopInfo[] {
  const stops: StopInfo[] = [];
  if (points.length < 2) return stops;
  const minDurMs = minDurationMin * 60_000;

  const flush = (endIdx: number) => {
    const cluster = points.slice(anchorIdx, endIdx + 1);
    const dur = cluster[cluster.length - 1].t - cluster[0].t;
    if (dur >= minDurMs && cluster.length >= 2) {
      const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const lng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;
      stops.push({
        lat,
        lng,
        start: cluster[0].t,
        end: cluster[cluster.length - 1].t,
        index: stops.length + 1,
      });
    }
  };

  let anchorIdx = 0;
  for (let i = 1; i < points.length; i++) {
    const anchor = points[anchorIdx];
    if (haversineMeters(anchor.lat, anchor.lng, points[i].lat, points[i].lng) <= radiusM) continue;
    flush(i - 1);
    anchorIdx = i;
  }
  flush(points.length - 1);
  return stops;
}

export function interpolateAt(points: TrackPoint[], tMs: number): TrackPoint | null {
  if (points.length === 0) return null;
  if (tMs <= points[0].t) return points[0];
  const last = points[points.length - 1];
  if (tMs >= last.t) return last;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= tMs) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const f = (tMs - a.t) / Math.max(1, b.t - a.t);
  return {
    ...a,
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
