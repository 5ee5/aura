"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/action-form";
import { localToday } from "@/lib/dates";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { getAthlete } from "@/server/profile/data";
import { createGarminClient, GarminError } from "./client";
import { syncGarmin } from "./sync";

let running = false;

export async function syncFromGarmin(): Promise<FormState> {
  await requireSession();
  const apiKey = getEnv().GARMIN_API_KEY;
  if (!apiKey) return { error: "No Garmin key is set. Add GARMIN_API_KEY to .env and restart Aura." };
  const athlete = await getAthlete();
  if (!athlete) return { error: "Save your name first, under About you." };
  if (running) return { error: "A sync is already running." };

  running = true;
  try {
    const result = await syncGarmin(getDb(), createGarminClient({ apiKey }), athlete.id, { today: localToday() });
    revalidatePath("/", "layout");
    return { ok: true, message: `Synced ${result.activities} activities; ${result.bests} bests found.` };
  } catch (error) {
    if (error instanceof GarminError) return { error: error.message };
    console.error("Garmin sync failed:", error instanceof Error ? error.message : error);
    return { error: "The sync failed. Nothing was changed." };
  } finally {
    running = false;
  }
}
