import { queryLocationsInBbox, querySimplifiedTracks } from "@app/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDateTime(dateStr: string, timeStr = "00:00"): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const offset = process.env.TZ_OFFSET ?? "+05:30";
  const d = new Date(`${dateStr}T${timeStr}:00${offset}`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const startDateStr = url.searchParams.get("startDate") ?? url.searchParams.get("date") ?? "";
  const endDateStr = url.searchParams.get("endDate") ?? startDateStr;
  const fromTime = url.searchParams.get("from") ?? "00:00";
  const toTime = url.searchParams.get("to") ?? "23:59";
  const bboxStr = url.searchParams.get("bbox"); // "minLng,minLat,maxLng,maxLat"
  const simplify = url.searchParams.get("simplify") === "true";
  const tolerance = Number.parseFloat(url.searchParams.get("tolerance") ?? "0.0001");

  const personIds = (url.searchParams.get("persons") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));

  // 1. Spatial bounding box query
  if (bboxStr) {
    const parts = bboxStr.split(",").map((p) => Number.parseFloat(p.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [minLng, minLat, maxLng, maxLat] = parts;
      const start = startDateStr ? parseDateTime(startDateStr, fromTime) ?? undefined : undefined;
      const end = endDateStr ? parseDateTime(endDateStr, toTime) ?? undefined : undefined;

      const rows = await queryLocationsInBbox({
        minLng,
        minLat,
        maxLng,
        maxLat,
        startDate: start,
        endDate: end,
        personIds: personIds.length > 0 ? personIds : undefined,
      });

      return Response.json({ count: rows.length, fixes: rows });
    }
    return Response.json({ error: "Invalid bbox format. Expected minLng,minLat,maxLng,maxLat" }, { status: 400 });
  }

  // 2. PostGIS ST_Simplify server-side track simplification
  const start = parseDateTime(startDateStr, fromTime);
  const end = parseDateTime(endDateStr, toTime);
  if (!start || !end) {
    return Response.json(
      { error: "startDate and endDate (or date) are required in YYYY-MM-DD format" },
      { status: 400 },
    );
  }

  const simplifiedTracks = await querySimplifiedTracks({
    startDate: start,
    endDate: end,
    personIds: personIds.length > 0 ? personIds : undefined,
    toleranceDegrees: Number.isFinite(tolerance) ? tolerance : 0.0001,
  });

  const featureCollection = {
    type: "FeatureCollection",
    features: simplifiedTracks
      .filter((t) => t.geojson !== null)
      .map((t) => ({
        type: "Feature",
        properties: {
          personId: t.personId,
          name: t.name,
          originalPoints: t.pointsCount,
          simplifiedPoints: t.geojson?.coordinates.length ?? 0,
        },
        geometry: t.geojson,
      })),
  };

  return Response.json({
    tracks: simplifiedTracks,
    featureCollection,
  });
}
