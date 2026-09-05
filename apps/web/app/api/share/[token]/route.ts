import { and, desc, eq, gte } from "drizzle-orm";
import { db, locations, persons, shareTokens } from "@app/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const [share] = await db
    .select()
    .from(shareTokens)
    .where(eq(shareTokens.token, token))
    .limit(1);

  if (!share) {
    return Response.json({ error: "Share link not found or invalid." }, { status: 404 });
  }

  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return Response.json(
      { error: "This share link has expired.", expired: true },
      { status: 410 },
    );
  }

  const [person] = await db
    .select({
      id: persons.id,
      name: persons.name,
      photoUrl: persons.photoUrl,
    })
    .from(persons)
    .where(eq(persons.id, share.personId))
    .limit(1);

  if (!person) {
    return Response.json({ error: "Tracked person not found." }, { status: 404 });
  }

  // Get latest location fix
  const [latestFix] = await db
    .select({
      lat: locations.lat,
      lng: locations.lng,
      accuracyM: locations.accuracyM,
      address: locations.address,
      batteryPct: locations.batteryPct,
      charging: locations.charging,
      recordedAt: locations.recordedAt,
    })
    .from(locations)
    .where(eq(locations.personId, person.id))
    .orderBy(desc(locations.recordedAt))
    .limit(1);

  // Get recent 12 hours points for a trail
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const trailPoints = await db
    .select({
      lat: locations.lat,
      lng: locations.lng,
      t: locations.recordedAt,
    })
    .from(locations)
    .where(and(eq(locations.personId, person.id), gte(locations.recordedAt, since)))
    .orderBy(locations.recordedAt);

  return Response.json({
    valid: true,
    label: share.label,
    expiresAt: share.expiresAt,
    person,
    latestFix: latestFix
      ? {
          ...latestFix,
          recordedAt: latestFix.recordedAt.toISOString(),
        }
      : null,
    trail: trailPoints.map((p) => [p.lng, p.lat]),
  });
}
