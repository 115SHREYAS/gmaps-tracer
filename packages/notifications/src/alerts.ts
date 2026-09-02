import { eq } from "drizzle-orm";
import { alertState, db } from "@app/db";
import { sendNotification } from "./dispatcher";

const SESSION_ALERT_KEY = "session_expiry";
const SESSION_RE_ALERT_MS = 12 * 60 * 60 * 1000; // 12 hours
const BATTERY_RE_ALERT_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function checkSessionAlert(
  sessionValid: boolean,
  errorMessage?: string,
): Promise<void> {
  const now = new Date();

  const [existing] = await db
    .select()
    .from(alertState)
    .where(eq(alertState.key, SESSION_ALERT_KEY))
    .limit(1);

  let payloadObj: { active?: boolean; error?: string } = {};
  if (existing?.payload) {
    try {
      payloadObj = JSON.parse(existing.payload);
    } catch {}
  }

  if (!sessionValid) {
    const isCurrentlyActive = payloadObj.active === true;
    const timeSinceLast = existing ? now.getTime() - existing.lastSentAt.getTime() : Infinity;

    // Send alert if first time entering invalid state or after cooldown
    if (!isCurrentlyActive || timeSinceLast > SESSION_RE_ALERT_MS) {
      await sendNotification({
        title: "Google Session Expired",
        message:
          "Location polling has stopped because Google Maps session cookies are expired or invalid.\n\n" +
          `Detail: ${errorMessage || "Unauthenticated response from Google"}\n\n` +
          "Action: Export fresh cookies from google.com and upload in Settings.",
        level: "danger",
      });

      await db
        .insert(alertState)
        .values({
          key: SESSION_ALERT_KEY,
          lastSentAt: now,
          payload: JSON.stringify({ active: true, error: errorMessage ?? "" }),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: alertState.key,
          set: {
            lastSentAt: now,
            payload: JSON.stringify({ active: true, error: errorMessage ?? "" }),
            updatedAt: now,
          },
        });
    }
  } else {
    // Session is valid. If previously alerted, notify recovery
    if (payloadObj.active === true) {
      await sendNotification({
        title: "Google Session Restored",
        message: "Google Maps session is nominal. Live tracking has resumed successfully.",
        level: "info",
      });

      await db
        .insert(alertState)
        .values({
          key: SESSION_ALERT_KEY,
          lastSentAt: now,
          payload: JSON.stringify({ active: false }),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: alertState.key,
          set: {
            payload: JSON.stringify({ active: false }),
            updatedAt: now,
          },
        });
    }
  }
}

export interface BatteryAlertTarget {
  id: string;
  name: string;
  batteryPct: number | null;
  charging: boolean | null;
  address: string | null;
  lat: number;
  lng: number;
}

export async function checkBatteryAlert(person: BatteryAlertTarget): Promise<void> {
  if (person.batteryPct == null) return;

  const threshold = Math.max(5, Math.min(50, Number(process.env.BATTERY_ALERT_THRESHOLD ?? 20)));
  const key = `battery:${person.id}`;
  const now = new Date();

  const [existing] = await db
    .select()
    .from(alertState)
    .where(eq(alertState.key, key))
    .limit(1);

  let payloadObj: { active?: boolean; pct?: number } = {};
  if (existing?.payload) {
    try {
      payloadObj = JSON.parse(existing.payload);
    } catch {}
  }

  // Low battery condition: at or below threshold and not charging
  if (person.batteryPct <= threshold && !person.charging) {
    const timeSinceLast = existing ? now.getTime() - existing.lastSentAt.getTime() : Infinity;
    const lastPct = payloadObj.pct ?? 100;

    // Alert if not alerted recently OR if battery has dropped significantly lower (>= 5% drop)
    const shouldAlert =
      !payloadObj.active ||
      timeSinceLast > BATTERY_RE_ALERT_MS ||
      person.batteryPct <= lastPct - 5;

    if (shouldAlert) {
      const locStr = person.address ?? `${person.lat.toFixed(4)}, ${person.lng.toFixed(4)}`;
      await sendNotification({
        title: `Low Battery: ${person.name}`,
        message:
          `${person.name}'s battery dropped to ${person.batteryPct}% (not charging).\n\n` +
          `Last location: ${locStr}`,
        level: "warning",
      });

      await db
        .insert(alertState)
        .values({
          key,
          lastSentAt: now,
          payload: JSON.stringify({ active: true, pct: person.batteryPct }),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: alertState.key,
          set: {
            lastSentAt: now,
            payload: JSON.stringify({ active: true, pct: person.batteryPct }),
            updatedAt: now,
          },
        });
    }
  } else if (person.batteryPct >= threshold + 10 || person.charging === true) {
    // Battery recovered or charging: reset active flag
    if (payloadObj.active) {
      await db
        .insert(alertState)
        .values({
          key,
          lastSentAt: now,
          payload: JSON.stringify({ active: false, pct: person.batteryPct }),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: alertState.key,
          set: {
            payload: JSON.stringify({ active: false, pct: person.batteryPct }),
            updatedAt: now,
          },
        });
    }
  }
}
