import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { getSessionOptions, type SessionData } from "./session-options";

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), getSessionOptions(false));
}
