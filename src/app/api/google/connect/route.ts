import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { hasSession } from "@/server/auth/dal";
import { getEnv } from "@/server/env";
import { googleClient } from "@/server/google/account";
import { authorizationUrl, STATE_COOKIE } from "@/server/google/oauth";

/** Sends the athlete to Google's consent screen. */
export async function GET() {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const client = googleClient();
  if (!client) return Response.redirect(new URL("/profile?google=not-set-up", getEnv().APP_URL), 303);
  const state = randomBytes(24).toString("base64url");
  // Lax, so it comes back with Google's redirect; it only has to last the round trip.
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https:"),
    path: "/api/google",
    maxAge: 600,
  });
  return Response.redirect(authorizationUrl(client, state), 303);
}
