import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, locations, persons } from "@app/db";
import { generateGeoJson, generateGpx, type TrackPoint } from "@/lib/geo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const offset = process.env.TZ_OFFSET ?? "+05:30";
  const d = new Date(`${date}T${time}:00${offset}`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const startDate = url.searchParams.get("startDate") ?? dateParam ?? "";
  const endDate = url.searchParams.get("endDate") ?? dateParam ?? startDate;
  const from = url.searchParams.get("from") ?? "00:00";
  const to = url.searchParams.get("to") ?? "23:59";
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();

  const personIds = (url.searchParams.get("persons") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));

  const start = parseDateTime(startDate, from);
  const end = parseDateTime(endDate, to);
  if (!start || !end) {
    return Response.json(
      {
        error:
          "invalid date/time; specify (startDate&endDate or date)=YYYY-MM-DD and from=HH:MM&to=HH:MM",
      },
      { status: 400 },
    );
  }

  const conditions = [gte(locations.recordedAt, start), lte(locations.recordedAt, end)];
  if (personIds.length > 0) conditions.push(inArray(locations.personId, personIds));

  const rows = await db
    .select({
      personId: locations.personId,
      name: persons.name,
      lat: locations.lat,
      lng: locations.lng,
      recordedAt: locations.recordedAt,
      accuracyM: locations.accuracyM,
      address: locations.address,
      batteryPct: locations.batteryPct,
      charging: locations.charging,
    })
    .from(locations)
    .innerJoin(persons, eq(locations.personId, persons.id))
    .where(and(...conditions))
    .orderBy(asc(locations.recordedAt));

  const grouped = new Map<string, { personId: string; name: string; points: TrackPoint[] }>();
  for (const r of rows) {
    let track = grouped.get(r.personId);
    if (!track) {
      track = { personId: r.personId, name: r.name, points: [] };
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

  const trackList = [...grouped.values()];

  if (format === "gpx") {
    const filename = `gpstracks-${startDate}${startDate !== endDate ? `-to-${endDate}` : ""}.gpx`;
    const xml = generateGpx(trackList, `GPS Tracks ${startDate} to ${endDate}`);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/gpx+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === "geojson") {
    const filename = `gpstracks-${startDate}${startDate !== endDate ? `-to-${endDate}` : ""}.geojson`;
    const geojson = generateGeoJson(trackList);
    return new Response(JSON.stringify(geojson, null, 2), {
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return Response.json({ tracks: trackList });
}
