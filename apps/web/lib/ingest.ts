import { desc, eq } from "drizzle-orm";
import { db, locations, persons } from "@app/db";
import { haversineMeters } from "./geo";

export interface IngestInput {
  trackerId: string;
  name: string;
  lat: number;
  lng: number;
  timestampSec?: number;
  accuracyM?: number | null;
  batteryPct?: number | null;
  charging?: boolean | null;
  address?: string | null;
}

export function verifyIngestAuth(req: Request): { ok: boolean; error?: string } {
  const configuredToken = process.env.INGEST_TOKEN;
  if (!configuredToken) {
    // If no INGEST_TOKEN is set, allow ingestion but log advisory
    return { ok: true };
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const headerToken = req.headers.get("x-ingest-token");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const provided = queryToken || headerToken || bearerToken;
  if (!provided || provided !== configuredToken) {
    return { ok: false, error: "Unauthorized: Invalid or missing ingest token." };
  }

  return { ok: true };
}

export async function processLocationIngest(input: IngestInput): Promise<{
  personId: string;
  inserted: boolean;
  reason?: string;
}> {
  const { trackerId, name, lat, lng } = input;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Invalid coordinates: lat=${lat}, lng=${lng}`);
  }

  // Upsert person by trackerId (mapped to google_id column)
  const [person] = await db
    .insert(persons)
    .values({
      googleId: trackerId,
      name,
    })
    .onConflictDoUpdate({
      target: persons.googleId,
      set: { name },
    })
    .returning();

  if (!person) {
    throw new Error("Could not find or create person for trackerId.");
  }

  const recordedAt = input.timestampSec ? new Date(input.timestampSec * 1000) : new Date();

  // Deduplication check: compare with latest fix
  const [lastFix] = await db
    .select({
      lat: locations.lat,
      lng: locations.lng,
      recordedAt: locations.recordedAt,
    })
    .from(locations)
    .where(eq(locations.personId, person.id))
    .orderBy(desc(locations.recordedAt))
    .limit(1);

  if (lastFix) {
    const distM = haversineMeters(lastFix.lat, lastFix.lng, lat, lng);
    const dtMs = Math.abs(recordedAt.getTime() - lastFix.recordedAt.getTime());

    // Dedupe: skip if stationary (<50m) and newer fix is within 5 minutes
    if (distM < 50 && dtMs < 5 * 60 * 1000) {
      return { personId: person.id, inserted: false, reason: "deduplicated (stationary)" };
    }
  }

  await db.insert(locations).values({
    personId: person.id,
    lat,
    lng,
    accuracyM: input.accuracyM ?? null,
    batteryPct: input.batteryPct ?? null,
    charging: input.charging ?? null,
    address: input.address ?? null,
    recordedAt,
  });

  return { personId: person.id, inserted: true };
}
