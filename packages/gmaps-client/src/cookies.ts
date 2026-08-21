import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const REQUIRED_COOKIES = ["__Secure-1PSID", "__Secure-3PSID", "SID", "HSID", "SSID", "SAPISID"];

export interface ParsedCookie {
  name: string;
  value: string;
}

/**
 * Parse a Netscape-format cookies.txt file (as exported by "Get cookies.txt
 * LOCALLY" / "Export cookies" browser extensions) or a raw `name=value; ...`
 * Cookie header string.
 */
export function parseCookiesFile(contents: string): ParsedCookie[] {
  const cookies = new Map<string, string>();
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("# ")) continue; // netscape comment (but not #HttpOnly_ entries)
    const parts = line.split("\t");
    if (parts.length >= 7) {
      // domain  flag  path  secure  expiry  name  value
      const name = parts[5];
      const value = parts.slice(6).join("\t");
      if (name) cookies.set(name, value);
      continue;
    }
    // Fallback: name=value pairs separated by ';'
    for (const pair of line.split(";")) {
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (name && !cookies.has(name)) cookies.set(name, value);
    }
  }

  return [...cookies.entries()].map(([name, value]) => ({ name, value }));
}

export function validateCookies(cookies: ParsedCookie[]): void {
  const names = new Set(cookies.map((c) => c.name));
  const missing = REQUIRED_COOKIES.filter((n) => !names.has(n));
  if (!names.has("__Secure-1PSID")) {
    throw new Error(
      `Missing required cookie __Secure-1PSID${missing.length ? ` (also missing: ${missing.join(", ")})` : ""}. Re-export a fresh cookies.txt while logged in at google.com/maps.`,
    );
  }
}

export function toCookieHeader(cookies: ParsedCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM encrypt -> base64(iv | tag | ciphertext). */
export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decrypt(payload: string, secret: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
