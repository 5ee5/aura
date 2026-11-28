import "server-only";
import { eq } from "drizzle-orm";
import { addDays, localToday } from "@/lib/dates";
import { plannedAndRun } from "@/server/calendar/data";
import { getDb } from "@/server/db/client";
import { googleAccounts } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { getGoogleAccount, googleClient, refreshTokenFor } from "./account";
import { CalendarApi, planChanges, wantedEvent } from "./calendar-sync";
import { GoogleError, grantedScopes, refreshAccess } from "./oauth";

/** A month back keeps recent history right; a year ahead covers any plan. */
const DAYS_BACK = 30;
const DAYS_AHEAD = 365;

export interface PushStatus {
  at: Date;
  how: "button" | "timer" | "change";
  error?: string;
}

const state = globalThis as {
  googlePushRunning?: boolean;
  googlePushAgain?: boolean;
  googleLastPush?: PushStatus;
  googlePushTimer?: NodeJS.Timeout;
};
export const lastGooglePush = () => state.googleLastPush;

/**
 * Brings the Aura calendar in line with the approved workouts: creates the
 * calendar if it is missing, then adds, changes and removes events. Never two
 * at once; a request during a run makes it run once more afterwards.
 */
export async function pushWorkouts(how: PushStatus["how"]): Promise<{ changed?: number; error?: string }> {
  const client = googleClient();
  const account = await getGoogleAccount();
  if (!client || !account) return { error: "Google Calendar is not connected." };
  if (state.googlePushRunning) {
    state.googlePushAgain = true;
    return {};
  }
  state.googlePushRunning = true;
  try {
    if (!grantedScopes(account.scopes).ownCalendar)
      throw new GoogleError("reconnect", "Connect Google again so Aura can manage its own calendar.");
    const refreshToken = await refreshTokenFor(client);
    if (!refreshToken) throw new GoogleError("reconnect", "Aura's Google access can't be read. Connect again on the Profile page.");
    const api = new CalendarApi((await refreshAccess(client, refreshToken)).accessToken);

    let calendarId = account.auraCalendarId;
    if (!calendarId || !(await api.calendarExists(calendarId))) {
      calendarId = await api.createCalendar(Intl.DateTimeFormat().resolvedOptions().timeZone);
      await getDb().update(googleAccounts).set({ auraCalendarId: calendarId }).where(eq(googleAccounts.id, account.id));
    }

    const today = localToday();
    const from = addDays(today, -DAYS_BACK);
    const { workouts, matches } = await plannedAndRun(from, addDays(today, DAYS_AHEAD));
    const appUrl = getEnv().APP_URL;
    const wanted = workouts.map((w) => wantedEvent(w, appUrl, matches.get(w.id)?.outcome === "done"));
    const plan = planChanges(wanted, await api.listEvents(calendarId, from));
    for (const w of plan.create) await api.insert(calendarId, w);
    for (const { eventId, wanted: w } of plan.update) await api.update(calendarId, eventId, w);
    for (const eventId of plan.remove) await api.remove(calendarId, eventId);

    await getDb().update(googleAccounts).set({ syncedAt: new Date() }).where(eq(googleAccounts.id, account.id));
    state.googleLastPush = { at: new Date(), how };
    return { changed: plan.create.length + plan.update.length + plan.remove.length };
  } catch (error) {
    const message = error instanceof GoogleError ? error.message : "Updating the Aura calendar failed.";
    if (!(error instanceof GoogleError)) console.error("Google push failed:", error instanceof Error ? error.message : error);
    state.googleLastPush = { at: new Date(), how, error: message };
    return { error: message };
  } finally {
    state.googlePushRunning = false;
    if (state.googlePushAgain) {
      state.googlePushAgain = false;
      void pushWorkouts(how);
    }
  }
}

/**
 * After a workout changes: update Google a few seconds later, in the
 * background, so the athlete's action never waits on or fails because of
 * Google. Only the live server writes to Google; development and tests never do.
 */
export function pushSoon() {
  if (getEnv().NODE_ENV !== "production" || !googleClient()) return;
  clearTimeout(state.googlePushTimer);
  state.googlePushTimer = setTimeout(() => {
    pushWorkouts("change").catch((error) => console.error("Google push failed:", error instanceof Error ? error.message : error));
  }, 3_000);
  state.googlePushTimer.unref();
}
