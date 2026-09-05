import { processLocationIngest, verifyIngestAuth } from "@/lib/ingest";

interface GenericIngestPayload {
  name?: string;
  trackerId?: string;
  device?: string;
  lat: number;
  lng?: number;
  lon?: number;
  timestamp?: number | string;
  time?: number | string;
  accuracy?: number;
  accuracyM?: number;
  battery?: number;
  batteryPct?: number;
  charging?: boolean;
  address?: string;
}

export async function POST(req: Request) {
  const auth = verifyIngestAuth(req);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = (await req.json()) as GenericIngestPayload;

    const lat = body.lat;
    const lng = body.lng ?? body.lon;

    if (lat == null || lng == null) {
      return Response.json({ error: "lat and lng (or lon) are required" }, { status: 400 });
    }

    const name = body.name || body.device || body.trackerId || "Remote Tracker";
    const trackerId = body.trackerId ? `device:${body.trackerId}` : `device:${name.toLowerCase().replace(/\s+/g, "-")}`;

    let timestampSec: number | undefined;
    const rawTime = body.timestamp ?? body.time;
    if (typeof rawTime === "number") {
      timestampSec = rawTime > 1e11 ? Math.floor(rawTime / 1000) : rawTime;
    } else if (typeof rawTime === "string") {
      const parsed = Date.parse(rawTime);
      if (!Number.isNaN(parsed)) {
        timestampSec = Math.floor(parsed / 1000);
      }
    }

    const result = await processLocationIngest({
      trackerId,
      name,
      lat,
      lng,
      timestampSec,
      accuracyM: body.accuracy ?? body.accuracyM,
      batteryPct: body.battery ?? body.batteryPct,
      charging: body.charging,
      address: body.address,
    });

    return Response.json({
      ok: true,
      personId: result.personId,
      inserted: result.inserted,
      reason: result.reason,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
