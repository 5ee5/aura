"use server";

import type { FormState } from "@/components/action-form";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/dal";
import { getEnv } from "@/server/env";
import { getGoogleAccount } from "@/server/google/account";
import { pushWorkouts } from "@/server/google/push";
import { runGarminSync } from "./run";

export async function syncFromGarmin(): Promise<FormState> {
  await requireSession();
  const { result, error } = await runGarminSync("button");
  if (error || !result) return { error: error ?? "The sync failed. Nothing was changed." };
  return { ok: true, message: `Synced ${result.activities} activities; ${result.bests} bests found.` };
}

/** The Calendar's Sync now: read Garmin, then write workouts to Google, whichever are set up. */
export async function syncEverything(): Promise<FormState> {
  await requireSession();
  const parts: string[] = [];
  const errors: string[] = [];
  if (getEnv().GARMIN_API_KEY) {
    const { result, error } = await runGarminSync("button");
    if (error) errors.push(`Garmin: ${error}`);
    else parts.push(`${result?.activities} Garmin activities`);
  }
  if (await getGoogleAccount()) {
    const { changed, error } = await pushWorkouts("button");
    if (error) errors.push(`Google: ${error}`);
    else parts.push(`the Aura calendar (${changed ?? 0} changes)`);
  }
  revalidatePath("/", "layout");
  if (errors.length) return { error: errors.join(" ") };
  return { ok: true, message: parts.length ? `Synced ${parts.join(" and ")}.` : "Nothing to sync." };
}
