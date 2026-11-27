"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localToday } from "@/lib/dates";
import { type Draft, draftToInput } from "@/lib/workout-editor";
import type { WorkoutStatus } from "@/lib/workout";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/profile/data";
import { readProposal } from "./proposal";
import { checkSchedule, planned } from "./check-schedule";
import { breaksRule, limitsFrom } from "./rules";
import { decide, getWorkout, updateWorkout } from "./store";

/** Field names from readProposal, in words the athlete knows. */
function friendly(message: string): string {
  return message
    .replace(/^Invalid workout at title:.*/, "Give the workout a title of up to 100 characters.")
    .replace(/^Invalid workout at description:.*/, "Add a description of up to 1000 characters.")
    .replace(/^Invalid workout at steps:.*/, "A workout has 1 to 20 steps.")
    .replace(/^step (\d+(\.\d+)?): pace "(.*)" is not m:ss per km between 2:30 and 12:00/, "Step $1: pace “$3” should be m:ss per km, between 2:30 and 12:00.")
    .replace(/^step (\d+(\.\d+)?): pace_fastest is slower than pace_slowest/, "Step $1: the fastest pace is slower than the slowest.")
    .replace(/^step (\d+(\.\d+)?): heart_rate_min is above heart_rate_max/, "Step $1: the lowest heart rate is above the highest.")
    .replace(/^step (\d+): a repeat needs 1 to 10 steps/, "Step $1: a repeat holds 1 to 10 steps.");
}

/**
 * Saves the athlete's edits to a workout that is still current, checked like a
 * proposal. With approve, a proposal is approved as well.
 */
export async function saveWorkout(
  id: number,
  draft: Draft,
  approve: boolean,
): Promise<{ error?: string; status?: WorkoutStatus }> {
  await requireSession();
  if (!z.number().int().positive().max(2_147_483_647).safeParse(id).success) {
    return { error: "That workout no longer exists." };
  }
  const db = getDb();
  const workout = await getWorkout(db, id);
  if (!workout) return { error: "That workout no longer exists." };
  if (workout.status !== "proposed" && workout.status !== "approved") {
    return { error: "This workout was declined or replaced, so it can’t be changed." };
  }

  const input = draftToInput(draft);
  if (typeof input === "string") return { error: input };
  const edited = readProposal(input);
  if (typeof edited === "string") return { error: friendly(edited) };
  const limits = limitsFrom(await getProfile());
  const broken = breaksRule(edited, limits, localToday(), workout.scheduledOn);
  if (broken) return { error: broken.message };
  if (edited.scheduledOn && (workout.status === "approved" || approve)) {
    const clash = await checkSchedule(db, [planned({ ...edited, id }, edited.scheduledOn)], limits, [id, workout.replacesId]);
    if (clash) return { error: clash };
  }

  await updateWorkout(db, id, edited);
  let status: WorkoutStatus = workout.status;
  if (approve && status === "proposed") status = (await decide(db, id, "approved"))?.[0]?.status ?? status;
  // Chats show the cards too; this also clears the browser's stored copies.
  revalidatePath("/", "layout");
  return { status };
}
