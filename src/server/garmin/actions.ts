"use server";

import type { FormState } from "@/components/action-form";
import { requireSession } from "@/server/auth/dal";
import { runGarminSync } from "./run";

export async function syncFromGarmin(): Promise<FormState> {
  await requireSession();
  const { result, error } = await runGarminSync("button");
  if (error || !result) return { error: error ?? "The sync failed. Nothing was changed." };
  return { ok: true, message: `Synced ${result.activities} activities; ${result.bests} bests found.` };
}
