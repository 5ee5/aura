import "server-only";
import { lastGarminSync } from "@/server/activities/store";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { syncDue } from "./auto-sync-timing";
import { lastAttempt, runGarminSync } from "./run";

const CHECK_EVERY_MS = 10 * 60_000;
const state = globalThis as { garminTimer?: NodeJS.Timeout };

/** Production only, with a key: development and tests never sync on their own. */
export function autoSyncEnabled(): boolean {
  const env = getEnv();
  return env.NODE_ENV === "production" && Boolean(env.GARMIN_API_KEY) && process.env.GARMIN_AUTO_SYNC !== "0";
}

async function tick() {
  try {
    const last = lastAttempt()?.at ?? (await lastGarminSync(getDb()));
    if (!syncDue(new Date(), last)) return;
    const { result, error } = await runGarminSync("timer");
    console.log(error ? `Garmin auto-sync failed: ${error}` : `Garmin auto-sync: ${result?.activities} activities.`);
  } catch (error) {
    console.error("Garmin auto-sync check failed:", error instanceof Error ? error.message : error);
  }
}

/** Called once at server start. Checks every ten minutes whether a sync is due. */
export function startAutoSync() {
  if (!autoSyncEnabled() || state.garminTimer) return;
  state.garminTimer = setInterval(tick, CHECK_EVERY_MS);
  state.garminTimer.unref();
  setTimeout(tick, 60_000).unref();
}
