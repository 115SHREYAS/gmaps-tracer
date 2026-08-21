import { desc, eq } from "drizzle-orm";
import { db, syncLog, syncState } from "@app/db";

export async function GET() {
  const [state] = await db.select().from(syncState).where(eq(syncState.id, 1));
  const logs = await db.select().from(syncLog).orderBy(desc(syncLog.ranAt)).limit(20);
  return Response.json({
    hasCookies: Boolean(state?.cookiesEncrypted),
    sessionValid: state?.sessionValid ?? false,
    lastPollAt: state?.lastPollAt ?? null,
    lastError: state?.lastError ?? null,
    pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS ?? 300),
    logs,
  });
}
