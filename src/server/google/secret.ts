// Encrypts the Google refresh token at rest, so database dumps and backups do
// not carry a usable token. The key comes from the client secret in .env:
// changing the secret means connecting again, which a new client needs anyway.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const key = (clientSecret: string) => createHash("sha256").update(`aura-google-token:${clientSecret}`).digest();

export function encryptToken(token: string, clientSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(clientSecret), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** Undefined when the text was not made with this secret or was altered. */
export function decryptToken(text: string, clientSecret: string): string | undefined {
  const [version, iv, tag, body] = text.split(".");
  if (version !== "v1" || !iv || !tag || !body) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(clientSecret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}
