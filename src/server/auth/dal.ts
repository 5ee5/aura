import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/server/env";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Call in every page, server action and route handler that touches private data.
 * The proxy check alone is not enough.
 */
export async function requireSession(): Promise<void> {
  // Reading the cookie first marks the caller as per-request, never prerendered.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const env = getEnv();
  const keys = { secret: env.SESSION_SECRET, passwordHash: env.AUTH_PASSWORD_HASH };
  if (!verifySessionToken(token, keys)) redirect("/login");
}
