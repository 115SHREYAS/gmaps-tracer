import { pool } from "@app/db";

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
  const { rows } = await pool.query<LiveRow>(`
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
  `);
  return Response.json(rows);
}
