import { eq } from "drizzle-orm";
import { db, syncState } from "@app/db";
import { encrypt, parseCookiesFile, validateCookies } from "@app/gmaps-client";

export async function GET() {
  const [state] = await db.select().from(syncState).where(eq(syncState.id, 1));
  return Response.json({ hasCookies: Boolean(state?.cookiesEncrypted) });
}

export async function POST(req: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return Response.json({ error: "SESSION_SECRET is not configured" }, { status: 500 });
  }

  const text = await req.text();
  if (!text.trim()) {
    return Response.json({ error: "Empty body — paste the contents of cookies.txt" }, { status: 400 });
  }

  try {
    const cookies = parseCookiesFile(text);
    validateCookies(cookies);
    const encrypted = encrypt(text.trim(), secret);
    await db
      .insert(syncState)
      .values({ id: 1, cookiesEncrypted: encrypted })
      .onConflictDoUpdate({
        target: syncState.id,
        set: { cookiesEncrypted: encrypted },
      });
    return Response.json({ ok: true, count: cookies.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
