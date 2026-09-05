import { count, eq } from "drizzle-orm";
import { db, persons } from "@app/db";

export async function GET() {
  const tokenConfigured = Boolean(process.env.INGEST_TOKEN && process.env.INGEST_TOKEN.trim().length > 0);

  // Count persons created via external ingestion
  const allPersons = await db.select().from(persons);
  const ingestedTrackers = allPersons.filter(
    (p) => p.googleId.startsWith("owntracks:") || p.googleId.startsWith("device:"),
  );

  return Response.json({
    tokenConfigured,
    endpoints: {
      owntracks: "/api/ingest/owntracks",
      generic: "/api/ingest/generic",
    },
    activeTrackersCount: ingestedTrackers.length,
    trackers: ingestedTrackers.map((t) => ({ id: t.id, name: t.name, key: t.googleId })),
  });
}
