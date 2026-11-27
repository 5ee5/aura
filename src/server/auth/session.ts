import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "aura_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

export interface SessionKeys {
  secret: string;
  /** Part of the signature, so changing the password ends every session. */
  passwordHash: string;
}

function sign(payload: string, { secret, passwordHash }: SessionKeys): Buffer {
  return createHmac("sha256", secret).update(`${payload}.${passwordHash}`).digest();
}

export function createSessionToken(keys: SessionKeys, now = Date.now()): string {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_SECONDS}`;
  return `${payload}.${sign(payload, keys).toString("base64url")}`;
}

export function verifySessionToken(
  token: string | undefined,
  keys: SessionKeys,
  now = Date.now(),
): boolean {
  const match = /^(v1\.(\d{1,12}))\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  if (!match) return false;
  const [, payload = "", expires = "", signature = ""] = match;
  const given = Buffer.from(signature, "base64url");
  const expected = sign(payload, keys);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(expires) * 1000 > now;
}
