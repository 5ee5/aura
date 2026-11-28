// Made-up values only; nothing calls Google.
import { describe, expect, it } from "vitest";
import { authorizationUrl, exchangeCode, GoogleError, grantedScopes, redirectUri, refreshAccess, SCOPES } from "./oauth";
import type { Workout } from "../../lib/workout";
import { CalendarApi, planChanges, wantedEvent, type ExistingEvent } from "./calendar-sync";
import { decryptToken, encryptToken } from "./secret";

const client = { clientId: "id.example", clientSecret: "made-up-secret", redirectUri: redirectUri("https://aura.example") };

describe("token encryption", () => {
  it("round-trips, and refuses another secret or altered text", () => {
    const text = encryptToken("1//made-up-refresh", "made-up-secret");
    expect(text).not.toContain("made-up-refresh");
    expect(decryptToken(text, "made-up-secret")).toBe("1//made-up-refresh");
    expect(decryptToken(text, "another-secret")).toBeUndefined();
    expect(decryptToken(text.slice(0, -2) + "xx", "made-up-secret")).toBeUndefined();
    expect(decryptToken("plain", "made-up-secret")).toBeUndefined();
  });
});

describe("Google OAuth", () => {
  it("asks for offline access to Aura's own calendars only, with the state", () => {
    const url = new URL(authorizationUrl(client, "s123"));
    expect(url.searchParams.get("redirect_uri")).toBe("https://aura.example/api/google/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("s123");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(Object.values(SCOPES).sort());
  });

  const reply = (status: number, body: object) => (async () => Response.json(body, { status })) as unknown as typeof fetch;

  it("keeps the refresh token and the granted scopes", async () => {
    const result = await exchangeCode(client, "code", reply(200, { refresh_token: "r", scope: SCOPES.ownCalendar, access_token: "a" }));
    expect(result).toEqual({ refreshToken: "r", scopes: SCOPES.ownCalendar });
    expect(grantedScopes(result.scopes)).toEqual({ ownCalendar: true });
    expect(grantedScopes("openid")).toEqual({ ownCalendar: false });
  });

  it("asks to reconnect when Google sends no refresh token or rejects the grant", async () => {
    const none = await exchangeCode(client, "code", reply(200, { access_token: "a" })).catch((e: unknown) => e);
    expect(none).toBeInstanceOf(GoogleError);
    const revoked = await refreshAccess(client, "r", reply(400, { error: "invalid_grant" })).catch((e: unknown) => e);
    expect((revoked as GoogleError).kind).toBe("reconnect");
    const down = await refreshAccess(client, "r", reply(503, {})).catch((e: unknown) => e);
    expect((down as GoogleError).kind).toBe("unavailable");
  });
});

describe("writing workouts", () => {
  const workout = (id: number, scheduledOn: string, title = "Easy run"): Workout => ({
    id,
    title,
    type: "easy",
    scheduledOn,
    description: "Relaxed.",
    status: "approved",
    mock: false,
    replacesId: null,
    outcome: null,
    steps: [
      {
        kind: "run",
        repeatCount: null,
        durationSeconds: 2700,
        distanceMetres: null,
        paceFastest: null,
        paceSlowest: null,
        heartRateMin: null,
        heartRateMax: 145,
        intensity: "easy",
        instructions: null,
        steps: [],
      },
    ],
  });

  it("describes a workout as an all-day event with its steps and a link", () => {
    const event = wantedEvent(workout(7, "2026-12-01"), "https://aura.example", false);
    expect(event).toMatchObject({ workoutId: 7, date: "2026-12-01", summary: "Easy run (45 min)" });
    expect(event.description).toContain("Relaxed.");
    expect(event.description).toContain("HR 145");
    expect(event.description).toContain("https://aura.example/workouts/7");
    expect(wantedEvent(workout(7, "2026-12-01"), "https://aura.example", true).summary).toBe("✓ Easy run (45 min)");
  });

  it("plans creates, updates and removals so each workout has one event", () => {
    const a = wantedEvent(workout(1, "2026-12-01"), "https://aura.example", false);
    const b = wantedEvent(workout(2, "2026-12-02"), "https://aura.example", false);
    const c = wantedEvent(workout(3, "2026-12-03"), "https://aura.example", false);
    const existing: ExistingEvent[] = [
      { id: "e1", workoutId: 1, date: "2026-12-01", summary: a.summary, description: a.description },
      { id: "e2", workoutId: 2, date: "2026-11-30", summary: b.summary, description: b.description },
      { id: "e2b", workoutId: 2, date: "2026-12-02", summary: b.summary, description: b.description },
      { id: "e9", workoutId: 9, date: "2026-12-05", summary: "old", description: "" },
      { id: "x", workoutId: undefined, date: "2026-12-06", summary: "added by hand", description: "" },
    ];
    const plan = planChanges([a, b, c], existing);
    expect(plan.create.map((w) => w.workoutId)).toEqual([3]);
    expect(plan.update).toEqual([{ eventId: "e2", wanted: b }]);
    expect(plan.remove.sort()).toEqual(["e2b", "e9", "x"]);
    expect(planChanges([a], [existing[0]!])).toEqual({ create: [], update: [], remove: [] });
  });

  it("talks to Google: a missing calendar, a listing and an insert", async () => {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const doFetch = (async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (path.endsWith("/calendars/gone")) return new Response("", { status: 404 });
      if (path.endsWith("/events") && init.method === "GET")
        return Response.json({
          items: [
            { id: "e1", summary: "S", description: "D", start: { date: "2026-12-01" }, extendedProperties: { private: { auraWorkoutId: "4" } } },
            { id: "e2", summary: "hand", start: { dateTime: "2026-12-01T10:00:00Z" } },
          ],
        });
      return Response.json({ id: "new" });
    }) as unknown as typeof fetch;
    const api = new CalendarApi("token", doFetch);
    expect(await api.calendarExists("gone")).toBe(false);
    expect(await api.listEvents("cal", "2026-11-01")).toEqual([
      { id: "e1", workoutId: 4, date: "2026-12-01", summary: "S", description: "D" },
      { id: "e2", workoutId: undefined, date: undefined, summary: "hand", description: "" },
    ]);
    await api.insert("cal", wantedEvent(workout(5, "2026-12-01"), "https://aura.example", false));
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      body: {
        start: { date: "2026-12-01" },
        end: { date: "2026-12-02" },
        transparency: "transparent",
        reminders: { useDefault: false, overrides: [] },
        extendedProperties: { private: { auraWorkoutId: "5" } },
      },
    });
    const refused = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(new CalendarApi("t", refused).createCalendar("Europe/Riga")).rejects.toThrow("Connect again");
  });
});
