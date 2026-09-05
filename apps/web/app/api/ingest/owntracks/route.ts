import { processLocationIngest, verifyIngestAuth } from "@/lib/ingest";

interface OwnTracksLocationPayload {
  _type: string;
  lat?: number;
  lon?: number;
  tst?: number;
  acc?: number;
  batt?: number;
  bs?: number; // 0=unknown, 1=unplugged, 2=charging, 3=full
  tid?: string;
  topic?: string;
}

export async function POST(req: Request) {
  const auth = verifyIngestAuth(req);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = (await req.json()) as OwnTracksLocationPayload;

    // OwnTracks sends heartbeat or transition events; only ingest 'location'
    if (body._type !== "location") {
      return Response.json([]);
    }

    if (body.lat == null || body.lon == null) {
      return Response.json({ error: "Missing lat/lon coordinates" }, { status: 400 });
    }

    // Determine device/person display name
    let deviceName = "OwnTracks Device";
    if (body.topic) {
      const parts = body.topic.split("/");
      deviceName = parts[parts.length - 1] || parts[0];
    } else if (body.tid) {
      deviceName = `Tracker ${body.tid}`;
    }

    const trackerId = body.topic ? `owntracks:${body.topic}` : `owntracks:${body.tid ?? "device"}`;

    const isCharging = body.bs === 2 || body.bs === 3;

    await processLocationIngest({
      trackerId,
      name: deviceName,
      lat: body.lat,
      lng: body.lon,
      timestampSec: body.tst,
      accuracyM: body.acc,
      batteryPct: body.batt,
      charging: body.bs != null ? isCharging : null,
    });

    // OwnTracks HTTP protocol expects JSON response array
    return Response.json([]);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
