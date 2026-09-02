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
  placeName?: string | null;
}

export interface PlaceSummary {
  id: string;
  name: string;
  icon: string;
  lat: number;
  lng: number;
  radiusM: number;
  notifyOnEnter?: boolean;
  notifyOnLeave?: boolean;
}

export const TZ_OFFSET = "+05:30";
export const TIME_ZONE_LABEL = "Asia/Kolkata";
export const STALE_AFTER_MS = 15 * 60 * 1000;

// Curated for separation on the dark basemap and kept clear of the UI's
// signal-amber accent (#ffae3c), which must read unambiguously as "interactive".
export const PERSON_COLORS = [
  "#4cc2fa", // azure
  "#f26db8", // magenta
  "#41d48f", // mint
  "#8fa5ff", // periwinkle
  "#a78bfa", // violet
  "#2fd6c3", // teal
  "#fb6e6e", // coral
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

export function findMatchingPlace(
  lat: number,
  lng: number,
  placesList: PlaceSummary[],
): { place: PlaceSummary; distanceM: number } | null {
  let closest: PlaceSummary | null = null;
  let minDistance = Infinity;

  for (const p of placesList) {
    const dist = haversineMeters(lat, lng, p.lat, p.lng);
    if (dist <= p.radiusM && dist < minDistance) {
      minDistance = dist;
      closest = p;
    }
  }

  return closest ? { place: closest, distanceM: Math.round(minDistance) } : null;
}

export function iconForPlace(icon: string): string {
  switch (icon.toLowerCase()) {
    case "home":
      return "🏠";
    case "work":
    case "office":
    case "briefcase":
      return "🏢";
    case "gym":
    case "fitness":
      return "🏋️";
    case "school":
    case "college":
    case "university":
      return "🎓";
    case "coffee":
    case "cafe":
      return "☕";
    case "shop":
    case "cart":
      return "🛒";
    case "star":
      return "⭐";
    case "airport":
    case "plane":
      return "✈️";
    case "heart":
      return "❤️";
    default:
      return "📍";
  }
}

export function createCirclePolygon(
  lat: number,
  lng: number,
  radiusM: number,
  points = 64,
): [number, number][] {
  const coords: [number, number][] = [];
  const R = 6371000;
  const dByR = radiusM / R;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const theta = (i * 2 * Math.PI) / points;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(dByR) +
        Math.cos(latRad) * Math.sin(dByR) * Math.cos(theta),
    );
    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(theta) * Math.sin(dByR) * Math.cos(latRad),
        Math.cos(dByR) - Math.sin(latRad) * Math.sin(pLat),
      );
    coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }
  return coords;
}

export function detectStops(
  points: TrackPoint[],
  radiusM = 75,
  minDurationMin = 10,
  places?: PlaceSummary[],
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
      let placeName: string | null = null;
      if (places && places.length > 0) {
        const match = findMatchingPlace(lat, lng, places);
        if (match) placeName = match.place.name;
      }
      stops.push({
        lat,
        lng,
        start: cluster[0].t,
        end: cluster[cluster.length - 1].t,
        index: stops.length + 1,
        placeName,
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

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE_LABEL }).format(d);
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function generateGpx(
  tracks: Array<{ personId: string; name: string; points: TrackPoint[] }>,
  title = "GpsLocationTracer Export",
): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GpsLocationTracer" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    "  <metadata>",
    `    <name>${escapeXml(title)}</name>`,
    `    <time>${new Date().toISOString()}</time>`,
    "  </metadata>",
  ];

  for (const track of tracks) {
    if (track.points.length === 0) continue;
    lines.push("  <trk>");
    lines.push(`    <name>${escapeXml(track.name)}</name>`);
    lines.push("    <trkseg>");
    for (const pt of track.points) {
      lines.push(`      <trkpt lat="${pt.lat}" lon="${pt.lng}">`);
      lines.push(`        <time>${new Date(pt.t).toISOString()}</time>`);
      const details = [
        pt.address ? `Address: ${pt.address}` : "",
        pt.batteryPct != null ? `Battery: ${pt.batteryPct}%` : "",
        pt.accuracyM != null ? `Accuracy: ±${Math.round(pt.accuracyM)}m` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      if (details) {
        lines.push(`        <desc>${escapeXml(details)}</desc>`);
      }
      lines.push("      </trkpt>");
    }
    lines.push("    </trkseg>");
    lines.push("  </trk>");
  }

  lines.push("</gpx>");
  return lines.join("\n");
}

export function generateGeoJson(
  tracks: Array<{ personId: string; name: string; color?: string; points: TrackPoint[] }>,
): object {
  const features = tracks.map((t) => ({
    type: "Feature",
    properties: {
      personId: t.personId,
      name: t.name,
      color: t.color,
      pointsCount: t.points.length,
      startedAt: t.points.length > 0 ? new Date(t.points[0].t).toISOString() : null,
      endedAt: t.points.length > 0 ? new Date(t.points[t.points.length - 1].t).toISOString() : null,
      timestamps: t.points.map((p) => p.t),
      addresses: t.points.map((p) => p.address ?? null),
      batteryLevels: t.points.map((p) => p.batteryPct ?? null),
    },
    geometry: {
      type: "LineString",
      coordinates: t.points.map((p) => [p.lng, p.lat]),
    },
  }));

  return {
    type: "FeatureCollection",
    features,
  };
}
