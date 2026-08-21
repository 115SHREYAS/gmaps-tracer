export interface SharedLocation {
  googleId: string;
  name: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  /** Epoch seconds of Google's last location update for this person. */
  timestampSec: number | null;
  accuracyM: number | null;
  address: string | null;
  batteryPct: number | null;
  charging: boolean | null;
}

export interface LocationsSnapshot {
  people: SharedLocation[];
}

export class GmapsClientError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "parse" | "network",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GmapsClientError";
  }
}
