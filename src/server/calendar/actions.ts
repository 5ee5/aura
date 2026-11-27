"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDate, localToday } from "@/lib/dates";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/profile/data";
import { breaksRule, limitsFrom } from "@/server/workouts/rules";
import { getWorkout, reschedule, setOutcome } from "@/server/workouts/store";

const idSchema = z.number().int().positive().max(2_147_483_647);
const GONE = { error: "That workout no longer exists." };

async function approved(id: number) {
  if (!idSchema.safeParse(id).success) return undefined;
  const workout = await getWorkout(getDb(), id);
  return workout?.status === "approved" ? workout : undefined;
}

/** Moves an approved workout to a day (checked like a proposal), or off the calendar. */
export async function moveWorkout(id: number, date: string | null): Promise<{ error?: string }> {
  await requireSession();
  const workout = await approved(id);
  if (!workout) return GONE;
  if (date !== null && !isDate(date)) return { error: "Pick a date." };
  if (date === workout.scheduledOn) return {};
  if (date !== null) {
    const broken = breaksRule({ ...workout, scheduledOn: date }, limitsFrom(await getProfile()), localToday());
    if (broken) return { error: broken.message };
  }
  await reschedule(getDb(), id, date);
  revalidatePath("/", "layout");
  return {};
}

/** Marks a workout done or skipped, or clears the mark, once its day has come. */
export async function markWorkout(id: number, outcome: "done" | "skipped" | null): Promise<{ error?: string }> {
  await requireSession();
  if (outcome !== null && outcome !== "done" && outcome !== "skipped") return GONE;
  const workout = await approved(id);
  if (!workout) return GONE;
  if (!workout.scheduledOn || workout.scheduledOn > localToday()) {
    return { error: "A workout can be marked once its day has come." };
  }
  await setOutcome(getDb(), id, outcome);
  revalidatePath("/", "layout");
  return {};
}
