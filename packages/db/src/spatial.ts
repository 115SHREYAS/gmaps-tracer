import { pool } from "./index";

export interface SimplifiedTrackResult {
  personId: string;
  name: string;
  pointsCount: number;
  geojson: {
    type: "LineString";
    coordinates: [number, number][];
  } | null;
}

export interface BboxFilter {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  startDate?: Date;
  endDate?: Date;
  personIds?: string[];
}

export interface SpatialQueryParams {
  startDate: Date;
  endDate: Date;
  personIds?: string[];
  toleranceDegrees?: number; // e.g. 0.0001 (~10m)
}

/**
 * Server-side PostGIS Douglas-Peucker line simplification (ST_Simplify).
 * Extremely fast aggregation that reduces thousands of points into a high-fidelity visual path.
 */
export async function querySimplifiedTracks(
  params: SpatialQueryParams,
): Promise<SimplifiedTrackResult[]> {
  const { startDate, endDate, personIds, toleranceDegrees = 0.0001 } = params;

  let personFilterSql = "";
  const values: unknown[] = [startDate, endDate, toleranceDegrees];

  if (personIds && personIds.length > 0) {
    values.push(personIds);
    personFilterSql = `AND l.person_id = ANY($${values.length}::uuid[])`;
  }

  const query = `
    WITH ordered_fixes AS (
      SELECT
        l.person_id,
        p.name,
        l.lat,
        l.lng,
        l.recorded_at
      FROM locations l
      JOIN persons p ON p.id = l.person_id
      WHERE l.recorded_at >= $1
        AND l.recorded_at <= $2
        ${personFilterSql}
      ORDER BY l.person_id, l.recorded_at ASC
    ),
    aggregated AS (
      SELECT
        person_id,
        name,
        count(*) as pts_count,
        ST_Simplify(
          ST_MakeLine(ST_SetSRID(ST_MakePoint(lng, lat), 4326)),
          $3
        ) as geom
      FROM ordered_fixes
      GROUP BY person_id, name
      HAVING count(*) >= 2
    )
    SELECT
      person_id AS "personId",
      name,
      pts_count AS "pointsCount",
      ST_AsGeoJSON(geom)::json AS geojson
    FROM aggregated;
  `;

  const { rows } = await pool.query<SimplifiedTrackResult>(query, values);
  return rows;
}

/**
 * Spatial viewport/bounding-box queries leveraging PostGIS GiST index.
 */
export async function queryLocationsInBbox(filter: BboxFilter) {
  const { minLng, minLat, maxLng, maxLat, startDate, endDate, personIds } = filter;
  const values: unknown[] = [minLng, minLat, maxLng, maxLat];

  const whereClauses = [
    `ST_Contains(
      ST_MakeEnvelope($1, $2, $3, $4, 4326),
      ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)
    )`,
  ];

  if (startDate) {
    values.push(startDate);
    whereClauses.push(`l.recorded_at >= $${values.length}`);
  }
  if (endDate) {
    values.push(endDate);
    whereClauses.push(`l.recorded_at <= $${values.length}`);
  }
  if (personIds && personIds.length > 0) {
    values.push(personIds);
    whereClauses.push(`l.person_id = ANY($${values.length}::uuid[])`);
  }

  const sql = `
    SELECT
      l.id,
      l.person_id AS "personId",
      p.name,
      l.lat,
      l.lng,
      l.accuracy_m AS "accuracyM",
      l.address,
      l.battery_pct AS "batteryPct",
      l.charging,
      l.recorded_at AS "recordedAt"
    FROM locations l
    JOIN persons p ON p.id = l.person_id
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY l.recorded_at ASC
    LIMIT 5000;
  `;

  const { rows } = await pool.query(sql, values);
  return rows;
}
