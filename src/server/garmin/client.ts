// Garmin Connect Personal API: read-only, one user. The key is swapped for a
// 24-hour bearer token; there is no refresh token, so an expired one is fetched again.
// Docs: developer.garmin.com/gc-developer-program/personal/

export const GARMIN_BASE_URL = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";

export type GarminErrorKind = "key" | "rate" | "unavailable";

/** Messages are shown to the athlete; they never include the key or token. */
export class GarminError extends Error {
  constructor(
    readonly kind: GarminErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GarminError";
  }
}

export interface GarminClient {
  get(path: string): Promise<unknown>;
}

interface Options {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

function problem(status: number): GarminError {
  if (status === 401 || status === 403)
    return new GarminError(
      "key",
      "Garmin refused the key. It may have expired: make a new one in Garmin Connect and put it in .env.",
    );
  if (status === 429) return new GarminError("rate", "Garmin asked us to slow down. Try again in a few minutes.");
  return new GarminError("unavailable", `Garmin did not answer properly (HTTP ${status}). Try again later.`);
}

/** Seconds since 1970 when a JWT expires, or undefined if it cannot be read. */
function expiry(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

export function createGarminClient({ apiKey, fetch: doFetch = fetch, baseUrl = GARMIN_BASE_URL }: Options) {
  let token: { value: string; expiresAt: number } | undefined;

  async function call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new GarminError("unavailable", "Could not reach Garmin. Try again later.");
    }
  }

  async function accessToken(): Promise<string> {
    // Renew a minute early so a token never runs out mid-sync.
    if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
    const response = await call(baseUrl + TOKEN_PATH, {
      method: "POST",
      headers: { Authorization: `ApiKey ${apiKey}` },
    });
    if (!response.ok) throw problem(response.status);
    // The token comes back as plain text: a JWT.
    const value = (await response.text()).trim();
    const exp = expiry(value);
    token = { value, expiresAt: exp ? exp * 1000 : Date.now() + 23 * 3600_000 };
    return value;
  }

  return {
    async get(path: string): Promise<unknown> {
      const response = await call(baseUrl + path, {
        headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" },
      });
      if (response.status === 401) token = undefined;
      if (!response.ok) throw problem(response.status);
      return response.json();
    },
  } satisfies GarminClient;
}
