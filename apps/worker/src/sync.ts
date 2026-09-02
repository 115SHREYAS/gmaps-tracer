import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  locations,
  persons,
  places,
  syncLog,
  syncState,
} from "@app/db";
import { decrypt, fetchLocations, parseCookiesFile, toCookieHeader } from "@app/gmaps-client";
import { checkBatteryAlert, checkGeofenceAlert, checkSessionAlert } from "@app/notifications";

const DEDUPE_RADIUS_M = 50;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function ensureSyncState() {
  await db.insert(syncState).values({ id: 1 }).onConflictDoNothing();
}

function loadCookieHeader(encrypted: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return toCookieHeader(parseCookiesFile(decrypt(encrypted, secret)));
}

/** Run one poll cycle. Never throws — all failures are recorded in sync_state/sync_log. */
export async function runSyncOnce(): Promise<{ ok: boolean; inserted: number }> {
  await ensureSyncState();

  try {
    const [state] = await db.select().from(syncState).where(eq(syncState.id, 1));
    if (!state?.cookiesEncrypted) {
      throw new Error("No cookies uploaded yet. Add your cookies.txt in Settings.");
    }

    const cookieHeader = loadCookieHeader(state.cookiesEncrypted);
    const authuser = Number.parseInt(process.env.GOOGLE_AUTHUSER ?? "0", 10) || 0;
    const snapshot = await fetchLocations(cookieHeader, { authuser });

    const allPlaces = await db.select().from(places);

    let inserted = 0;
    for (const person of snapshot.people) {
      const [row] = await db
        .insert(persons)
        .values({
          googleId: person.googleId,
          name: person.name,
          photoUrl: person.photoUrl,
        })
        .onConflictDoUpdate({
          target: persons.googleId,
          set: { name: person.name, photoUrl: person.photoUrl },
        })
        .returning();
      if (!row || person.timestampSec == null) continue;

      // Geofence entry / departure alert
      await checkGeofenceAlert(
        {
          id: row.id,
          name: person.name,
          lat: person.lat,
          lng: person.lng,
        },
        allPlaces,
      ).catch((err) => console.warn(`[alert] geofence check failed for ${person.name}:`, err));

      // Low battery check (checks threshold, charging state, and throttles)
      await checkBatteryAlert({
        id: row.id,
        name: person.name,
        batteryPct: person.batteryPct,
        charging: person.charging,
        address: person.address,
        lat: person.lat,
        lng: person.lng,
      }).catch((err) => console.warn(`[alert] battery check failed for ${person.name}:`, err));

      const recordedAt = new Date(person.timestampSec * 1000);

      // Dedupe: skip identical readings and stationary micro-movements.
      const lastRows = await db
        .select()
        .from(locations)
        .where(eq(locations.personId, row.id))
        .orderBy(desc(locations.recordedAt))
        .limit(1);
      const last = lastRows[0];

      if (last) {
        if (last.recordedAt.getTime() >= recordedAt.getTime()) continue;
        const dist = haversineMeters(last.lat, last.lng, person.lat, person.lng);
        const dt = recordedAt.getTime() - last.recordedAt.getTime();
        if (dist < DEDUPE_RADIUS_M && dt < DEDUPE_WINDOW_MS) continue;
      }

      await db.insert(locations).values({
        personId: row.id,
        lat: person.lat,
        lng: person.lng,
        accuracyM: person.accuracyM,
        address: person.address,
        batteryPct: person.batteryPct,
        charging: person.charging,
        recordedAt,
      });
      inserted++;
    }

    await db
      .update(syncState)
      .set({ lastPollAt: new Date(), lastError: null, sessionValid: true })
      .where(eq(syncState.id, 1));
    await db.insert(syncLog).values({
      peopleCount: snapshot.people.length,
      pointsInserted: inserted,
      ok: true,
    });

    await checkSessionAlert(true).catch((err) =>
      console.warn("[alert] session recovery check failed:", err),
    );

    console.log(`[sync] ok people=${snapshot.people.length} inserted=${inserted}`);
    return { ok: true, inserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAuthError = err instanceof Error && "kind" in err && (err as { kind?: string }).kind === "auth";
    await db
      .update(syncState)
      .set({
        lastPollAt: new Date(),
        lastError: message,
        ...(isAuthError ? { sessionValid: false } : {}),
      })
      .where(eq(syncState.id, 1));
    await db.insert(syncLog).values({ ok: false, error: message });

    if (isAuthError) {
      await checkSessionAlert(false, message).catch((alertErr) =>
        console.warn("[alert] session expiry alert failed:", alertErr),
      );
    }

    console.error(`[sync] failed: ${message}`);
    return { ok: false, inserted: 0 };
  }
}

export async function pruneOldLogs(keep = 500) {
  await db.execute(sql`
    DELETE FROM sync_log
    WHERE id NOT IN (
      SELECT id FROM sync_log ORDER BY ran_at DESC LIMIT ${keep}
    )
  `);
}
