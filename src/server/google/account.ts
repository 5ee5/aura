import "server-only";
import { getDb } from "@/server/db/client";
import { googleAccounts } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { redirectUri, type Client } from "./oauth";
import { decryptToken, encryptToken } from "./secret";

/** The OAuth client from .env, or undefined when Google is not set up. */
export function googleClient(): Client | undefined {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return undefined;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: redirectUri(env.APP_URL) };
}

export async function getGoogleAccount() {
  const [row] = await getDb().select().from(googleAccounts).limit(1);
  return row;
}

/** The decrypted refresh token, or undefined if none is stored or it no longer decrypts. */
export async function refreshTokenFor(client: Client): Promise<string | undefined> {
  const row = await getGoogleAccount();
  return row ? decryptToken(row.refreshToken, client.clientSecret) : undefined;
}

export async function saveGoogleAccount(client: Client, refreshToken: string, scopes: string) {
  const db = getDb();
  const values = { refreshToken: encryptToken(refreshToken, client.clientSecret), scopes, connectedAt: new Date() };
  await db.transaction(async (tx) => {
    await tx.delete(googleAccounts);
    await tx.insert(googleAccounts).values(values);
  });
}

/** Forgets the token. The Aura calendar stays in Google until the athlete deletes it. */
export async function forgetGoogleAccount() {
  await getDb().delete(googleAccounts);
}
