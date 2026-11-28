import "server-only";
import { revalidatePath } from "next/cache";
import { localToday } from "@/lib/dates";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { getAthlete } from "@/server/profile/data";
import { createGarminClient, GarminError } from "./client";
import { syncGarmin, type SyncResult } from "./sync";

/** What the last attempt did, kept in memory: there is one server process. */
export interface SyncStatus {
  at: Date;
  how: "button" | "timer";
  error?: string;
}

const state = globalThis as { garminSyncRunning?: boolean; garminLastAttempt?: SyncStatus };

export const lastAttempt = () => state.garminLastAttempt;

/** One sync, from the button or the timer. Never two at once. Messages are safe to show. */
export async function runGarminSync(how: SyncStatus["how"]): Promise<{ result?: SyncResult; error?: string }> {
  const apiKey = getEnv().GARMIN_API_KEY;
  if (!apiKey) return { error: "No Garmin key is set. Add GARMIN_API_KEY to .env and restart Aura." };
  const athlete = await getAthlete();
  if (!athlete) return { error: "Save your name first, under About you." };
  if (state.garminSyncRunning) return { error: "A sync is already running." };

  state.garminSyncRunning = true;
  try {
    const result = await syncGarmin(getDb(), createGarminClient({ apiKey }), athlete.id, { today: localToday() });
    state.garminLastAttempt = { at: new Date(), how };
    revalidatePath("/", "layout");
    return { result };
  } catch (error) {
    const message = error instanceof GarminError ? error.message : "The sync failed. Nothing was changed.";
    if (!(error instanceof GarminError)) console.error("Garmin sync failed:", error instanceof Error ? error.message : error);
    state.garminLastAttempt = { at: new Date(), how, error: message };
    return { error: message };
  } finally {
    state.garminSyncRunning = false;
  }
}
