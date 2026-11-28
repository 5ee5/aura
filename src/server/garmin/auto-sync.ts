import "server-only";
import { lastGarminSync } from "@/server/activities/store";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { getGoogleAccount, googleClient } from "@/server/google/account";
import { lastGooglePush, pushWorkouts } from "@/server/google/push";
import { GOOGLE_EVERY_HOURS, syncDue } from "./auto-sync-timing";
import { lastAttempt, runGarminSync } from "./run";

const CHECK_EVERY_MS = 10 * 60_000;
const state = globalThis as { garminTimer?: NodeJS.Timeout };

/** Production only: development and tests never sync on their own. GARMIN_AUTO_SYNC=0 stops both. */
const timerAllowed = () => getEnv().NODE_ENV === "production" && process.env.GARMIN_AUTO_SYNC !== "0";

export function autoSyncEnabled(): boolean {
  return timerAllowed() && Boolean(getEnv().GARMIN_API_KEY);
}

export function googleAutoSyncEnabled(): boolean {
  return timerAllowed() && Boolean(googleClient());
}

async function garminTick() {
  if (!autoSyncEnabled()) return;
  const last = lastAttempt()?.at ?? (await lastGarminSync(getDb()));
  if (!syncDue(new Date(), last)) return;
  const { result, error } = await runGarminSync("timer");
  console.log(error ? `Garmin auto-sync failed: ${error}` : `Garmin auto-sync: ${result?.activities} activities.`);
}

async function googleTick() {
  if (!googleAutoSyncEnabled()) return;
  const account = await getGoogleAccount();
  if (!account) return;
  const last = lastGooglePush()?.at ?? account.syncedAt ?? undefined;
  if (!syncDue(new Date(), last, GOOGLE_EVERY_HOURS)) return;
  const { changed, error } = await pushWorkouts("timer");
  if (error) console.log(`Google calendar update failed: ${error}`);
  else if (changed) console.log(`Google calendar updated: ${changed} changes.`);
}

async function tick() {
  for (const [name, run] of [["Garmin", garminTick], ["Google", googleTick]] as const) {
    try {
      await run();
    } catch (error) {
      console.error(`${name} auto-sync check failed:`, error instanceof Error ? error.message : error);
    }
  }
}

/** Called once at server start. Checks every ten minutes whether a sync is due. */
export function startAutoSync() {
  if (!timerAllowed() || state.garminTimer) return;
  state.garminTimer = setInterval(tick, CHECK_EVERY_MS);
  state.garminTimer.unref();
  setTimeout(tick, 60_000).unref();
}
