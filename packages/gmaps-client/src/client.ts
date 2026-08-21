import { GmapsClientError, type LocationsSnapshot, type SharedLocation } from "./types";

const READ_URL = "https://www.google.com/maps/rpc/locationsharing/read";

// Rendering payload captured from a real Maps session; irrelevant to location sharing.
const PB =
  "!1m7!8m6!1m3!1i14!2i8413!3i5385!2i6!3x4095!2m3!1e0!2sm!3i407105169!3m7!2sen!5e1105!" +
  "12m4!1e68!2m2!1sset!2sRoadmap!4e1!5m4!1e4!8m2!1e0!1e1!6m9!1e12!2i2!26m1!4b1!30m1!" +
  "1f1.3953487873077393!39b1!44e1!50e0!23i4111425";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function at(obj: unknown, ...path: number[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as unknown[])[key];
  }
  return cur;
}

function parsePersonEntry(entry: unknown): SharedLocation | null {
  try {
    const googleId = str(at(entry, 6, 0));
    const lat = num(at(entry, 1, 1, 2));
    const lng = num(at(entry, 1, 1, 1));
    if (!googleId || lat == null || lng == null) return null;

    const tsRaw = num(at(entry, 1, 2));
    let tsSec: number | null = null;
    if (tsRaw != null) {
      if (tsRaw > 1e12) tsSec = Math.floor(tsRaw / 1000);
      else if (tsRaw > 1e9) tsSec = Math.floor(tsRaw);
    }
    const batteryPct = num(at(entry, 13, 1));
    const chargingRaw = at(entry, 13, 0);

    return {
      googleId,
      name: str(at(entry, 6, 3)) ?? str(at(entry, 6, 2)) ?? googleId,
      photoUrl: str(at(entry, 6, 1)),
      lat,
      lng,
      timestampSec: tsSec,
      accuracyM: num(at(entry, 1, 3)),
      address: str(at(entry, 1, 4)),
      batteryPct: batteryPct != null ? Math.round(batteryPct) : null,
      charging: typeof chargingRaw === "boolean" ? chargingRaw : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the current location-sharing snapshot from Google's internal RPC
 * endpoint using exported session cookies.
 *
 * @param cookieHeader full Cookie header, e.g. "__Secure-1PSID=...; SID=..."
 * @param opts.authuser index of the Google account to query when multiple
 *        accounts share one browser cookie jar (0 = default/first account)
 */
export async function fetchLocations(
  cookieHeader: string,
  opts?: { authuser?: number },
): Promise<LocationsSnapshot> {
  const authuser = opts?.authuser ?? 0;
  const url = `${READ_URL}?authuser=${authuser}&hl=en&gl=us&pb=${encodeURIComponent(PB)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        cookie: cookieHeader,
        "user-agent": USER_AGENT,
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://www.google.com/maps",
      },
      redirect: "error",
    });
  } catch (err) {
    throw new GmapsClientError(
      `Network error contacting Google Maps: ${err instanceof Error ? err.message : String(err)}`,
      "network",
    );
  }

  if (res.status === 401 || res.status === 403 || res.status === 302) {
    throw new GmapsClientError(`Google rejected the session (HTTP ${res.status}).`, "auth", res.status);
  }
  if (!res.ok) {
    throw new GmapsClientError(`Unexpected HTTP ${res.status} from Google Maps.`, "network", res.status);
  }

  const body = await res.text();

  let data: unknown;
  try {
    // Response starts with XSSI guard ")]}';" or ")]}'"
    const jsonStart = body.indexOf("[");
    data = JSON.parse(body.slice(jsonStart));
  } catch {
    throw new GmapsClientError("Could not parse Google Maps response (endpoint may have changed).", "parse");
  }

  // Heuristic used by locationsharinglib: field 6 === 'GgA=' means unauthenticated.
  if (at(data, 6) === "GgA=") {
    throw new GmapsClientError("Session cookies are invalid or expired.", "auth");
  }

  const entries = at(data, 0);
  if (!Array.isArray(entries)) {
    throw new GmapsClientError("Response missing shared-people array.", "parse");
  }

  const people = entries
    .map(parsePersonEntry)
    .filter((p): p is SharedLocation => p !== null);

  return { people };
}
