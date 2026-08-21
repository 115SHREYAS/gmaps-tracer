import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, locations } from "@app/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const offset = process.env.TZ_OFFSET ?? "+05:30";
  const d = new Date(`${date}T${time}:00${offset}`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const from = url.searchParams.get("from") ?? "00:00";
  const to = url.searchParams.get("to") ?? "23:59";
  const personIds = (url.searchParams.get("persons") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));

  const start = parseDateTime(date, from);
  const end = parseDateTime(date, to);
  if (!start || !end) {
    return Response.json({ error: "invalid date/time; need date=YYYY-MM-DD&from=HH:MM&to=HH:MM" }, { status: 400 });
  }

  const conditions = [gte(locations.recordedAt, start), lte(locations.recordedAt, end)];
  if (personIds.length > 0) conditions.push(inArray(locations.personId, personIds));

  const rows = await db
    .select({
      personId: locations.personId,
      lat: locations.lat,
      lng: locations.lng,
      recordedAt: locations.recordedAt,
      accuracyM: locations.accuracyM,
      address: locations.address,
      batteryPct: locations.batteryPct,
      charging: locations.charging,
    })
    .from(locations)
    .where(and(...conditions))
    .orderBy(asc(locations.recordedAt));

  const grouped = new Map<string, { personId: string; points: unknown[] }>();
  for (const r of rows) {
    let track = grouped.get(r.personId);
    if (!track) {
      track = { personId: r.personId, points: [] };
      grouped.set(r.personId, track);
    }
    track.points.push({
      lat: r.lat,
      lng: r.lng,
      t: r.recordedAt.getTime(),
      accuracyM: r.accuracyM,
      address: r.address,
      batteryPct: r.batteryPct,
      charging: r.charging,
    });
  }

  return Response.json({ tracks: [...grouped.values()] });
}
