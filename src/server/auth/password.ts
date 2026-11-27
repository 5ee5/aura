import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

/** No "$" in the format: Next.js expands "$" inside .env files. */
export const PASSWORD_HASH_PATTERN = /^scrypt:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, COST, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!PASSWORD_HASH_PATTERN.test(stored)) return false;
  const [, salt = "", expected = ""] = stored.split(":");
  const actual = await derive(password, Buffer.from(salt, "base64url"));
  return timingSafeEqual(actual, Buffer.from(expected, "base64url"));
}
