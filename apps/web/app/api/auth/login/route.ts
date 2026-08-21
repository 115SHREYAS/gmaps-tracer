import { createHash, timingSafeEqual } from "node:crypto";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { getSessionOptions, isSecureRequest, type SessionData } from "@/lib/session-options";

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) {
    return Response.json({ error: "APP_PASSWORD is not configured on the server" }, { status: 500 });
  }
  if (typeof body.password !== "string" || !safeEqual(body.password, expected)) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(isSecureRequest(req)),
  );
  session.authenticated = true;
  await session.save();
  return Response.json({ ok: true });
}
