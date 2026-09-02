import { db, places, pool } from "@app/db";
import { findMatchingPlace } from "@/lib/geo";

interface LiveRow {
  id: string;
  googleId: string;
  name: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  address: string | null;
  batteryPct: number | null;
  charging: boolean | null;
  recordedAt: string;
}

export async function GET() {
  const [personRowsResult, placeRows] = await Promise.all([
    pool.query<LiveRow>(`
      SELECT p.id,
             p.google_id AS "googleId",
             p.name,
             p.photo_url AS "photoUrl",
             l.lat,
             l.lng,
             l.accuracy_m AS "accuracyM",
             l.address,
             l.battery_pct AS "batteryPct",
             l.charging,
             l.recorded_at AS "recordedAt"
      FROM persons p
      JOIN LATERAL (
        SELECT * FROM locations WHERE person_id = p.id ORDER BY recorded_at DESC LIMIT 1
      ) l ON TRUE
      ORDER BY p.name ASC
    `),
    db.select().from(places),
  ]);

  const rows = personRowsResult.rows.map((r) => {
    const match = findMatchingPlace(r.lat, r.lng, placeRows);
    return {
      ...r,
      place: match
        ? {
            id: match.place.id,
            name: match.place.name,
            icon: match.place.icon,
            distanceM: match.distanceM,
          }
        : null,
    };
  });

  return Response.json(rows);
}
