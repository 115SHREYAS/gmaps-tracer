import { pool } from "@app/db";

interface PersonRow {
  id: string;
  googleId: string;
  name: string;
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  address: string | null;
  batteryPct: number | null;
  charging: boolean | null;
}

export async function GET() {
  const { rows } = await pool.query<PersonRow>(`
    SELECT p.id,
           p.google_id AS "googleId",
           p.name,
           p.photo_url AS "photoUrl",
           l.lat,
           l.lng,
           l.recorded_at AS "lastSeenAt",
           l.address,
           l.battery_pct AS "batteryPct",
           l.charging
    FROM persons p
    LEFT JOIN LATERAL (
      SELECT * FROM locations WHERE person_id = p.id ORDER BY recorded_at DESC LIMIT 1
    ) l ON TRUE
    ORDER BY p.name ASC
  `);
  return Response.json(rows);
}
