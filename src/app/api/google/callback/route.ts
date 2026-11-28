import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hasSession } from "@/server/auth/dal";
import { getEnv } from "@/server/env";
import { googleClient, saveGoogleAccount } from "@/server/google/account";
import { exchangeCode, GoogleError, grantedScopes, revoke, STATE_COOKIE } from "@/server/google/oauth";
import { pushWorkouts } from "@/server/google/push";

const back = (result: string) => Response.redirect(new URL(`/profile?google=${result}#google-heading`, getEnv().APP_URL), 303);

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google sends the athlete back here with a code, or an error if they said no. */
export async function GET(request: NextRequest) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete({ name: STATE_COOKIE, path: "/api/google" });
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  if (!expected || !state || !same(expected, state)) return back("expired");
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "denied" : "failed");
  const code = params.get("code");
  const client = googleClient();
  if (!code || !client) return back("failed");

  try {
    const { refreshToken, scopes } = await exchangeCode(client, code);
    if (!grantedScopes(scopes).ownCalendar) {
      // Without it the grant is no use; hand it back.
      await revoke(refreshToken);
      return back("no-access");
    }
    await saveGoogleAccount(client, refreshToken, scopes);
  } catch (error) {
    if (!(error instanceof GoogleError)) console.error("Google connect failed:", error instanceof Error ? error.message : error);
    return back("failed");
  }
  // Fill the Aura calendar at once. A failure shows on the Calendar.
  await pushWorkouts("button");
  revalidatePath("/", "layout");
  return back("connected");
}
