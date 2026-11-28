// Google OAuth for one user: authorization-code flow with offline access.
// Docs: developers.google.com/identity/protocols/oauth2/web-server

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Holds the OAuth state for the round trip to Google. */
export const STATE_COOKIE = "aura_google_state";

/**
 * The only scope: make secondary calendars and manage events on them. Aura
 * cannot see or change any calendar it did not create.
 */
export const SCOPES = {
  ownCalendar: "https://www.googleapis.com/auth/calendar.app.created",
} as const;

export interface Client {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Messages are shown to the athlete; they never include tokens or secrets. */
export class GoogleError extends Error {
  constructor(
    readonly kind: "reconnect" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

export const redirectUri = (appUrl: string) => new URL("/api/google/callback", appUrl).toString();

export function authorizationUrl(client: Client, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: Object.values(SCOPES).join(" "),
    // A refresh token, and a new one even when access was granted before.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  }).toString();
  return url.toString();
}

async function tokenRequest(body: Record<string, string>, doFetch: typeof fetch) {
  let response: Response;
  try {
    response = await doFetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new GoogleError("unavailable", "Could not reach Google. Try again later.");
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return json;
  // invalid_grant: revoked, expired or replaced. Retrying will not help.
  if (json.error === "invalid_grant")
    throw new GoogleError("reconnect", "Google no longer accepts Aura's access. Connect again on the Profile page.");
  throw new GoogleError("unavailable", `Google refused the request (${String(json.error ?? response.status)}).`);
}

export async function exchangeCode(client: Client, code: string, doFetch: typeof fetch = fetch) {
  const json = await tokenRequest(
    {
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
      grant_type: "authorization_code",
    },
    doFetch,
  );
  if (typeof json.refresh_token !== "string")
    throw new GoogleError("reconnect", "Google sent no long-lived access. Remove Aura in your Google account's settings and connect again.");
  return { refreshToken: json.refresh_token, scopes: typeof json.scope === "string" ? json.scope : "" };
}

export async function refreshAccess(client: Client, refreshToken: string, doFetch: typeof fetch = fetch) {
  const json = await tokenRequest(
    { refresh_token: refreshToken, client_id: client.clientId, client_secret: client.clientSecret, grant_type: "refresh_token" },
    doFetch,
  );
  if (typeof json.access_token !== "string") throw new GoogleError("unavailable", "Google sent no access token.");
  const seconds = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return { accessToken: json.access_token, expiresAt: Date.now() + seconds * 1000 };
}

/** Best effort: a failed revoke still lets Aura forget the token. */
export async function revoke(token: string, doFetch: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await doFetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Whether Aura's scope was granted; the athlete can untick it on Google's screen. */
export function grantedScopes(scopes: string) {
  return { ownCalendar: new Set(scopes.split(" ")).has(SCOPES.ownCalendar) };
}
