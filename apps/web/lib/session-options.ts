import type { SessionOptions } from "iron-session";

export interface SessionData {
  authenticated?: boolean;
}

export const SESSION_COOKIE = "glt_session";

export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}

export function getSessionOptions(secure = false): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters (openssl rand -hex 32)");
  }
  return {
    cookieName: SESSION_COOKIE,
    password,
    ttl: 60 * 60 * 24 * 7,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure,
    },
  };
}
