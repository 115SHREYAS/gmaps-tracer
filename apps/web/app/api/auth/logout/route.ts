import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { getSessionOptions, isSecureRequest, type SessionData } from "@/lib/session-options";

export async function POST(req: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(isSecureRequest(req)),
  );
  session.destroy();
  return Response.json({ ok: true });
}
