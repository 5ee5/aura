"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StatusChange } from "@/lib/workout";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/server/profile/data";
import { checkSchedule, planned } from "./check-schedule";
import { limitsFrom } from "./rules";
import { decide, getWorkout } from "./store";
import { getWeek } from "./weeks";

const input = z.object({
  id: z.number().int().positive().max(2_147_483_647),
  decision: z.enum(["approved", "declined"]),
});

export async function decideWorkout(
  id: number,
  decision: "approved" | "declined",
): Promise<{ changes?: StatusChange[]; error?: string }> {
  await requireSession();
  const parsed = input.safeParse({ id, decision });
  if (!parsed.success) return { error: "That workout no longer exists." };
  const db = getDb();
  const workout = await getWorkout(db, parsed.data.id);
  // Approving can put workouts side by side that were proposed apart.
  if (workout?.status === "proposed" && workout.scheduledOn && parsed.data.decision === "approved") {
    const limits = limitsFrom(await getProfile());
    const clash = await checkSchedule(db, [planned(workout, workout.scheduledOn)], limits, [workout.id, workout.replacesId]);
    if (clash) return { error: clash };
  }
  const changes = await decide(db, parsed.data.id, parsed.data.decision);
  if (!changes) return { error: "That workout no longer exists." };
  revalidatePath("/", "layout");
  return { changes };
}

/** Approves or declines every workout in a proposed week that is still waiting. */
export async function decideWeek(
  weekId: number,
  decision: "approved" | "declined",
): Promise<{ changes?: StatusChange[]; error?: string }> {
  await requireSession();
  const parsed = input.safeParse({ id: weekId, decision });
  if (!parsed.success) return { error: "That week no longer exists." };
  const db = getDb();
  const week = await getWeek(db, parsed.data.id);
  if (!week) return { error: "That week no longer exists." };
  const waiting = week.days.flatMap((day) => day.workouts).filter((w) => w.status === "proposed");
  if (decision === "approved") {
    const dated = waiting.filter((w) => w.scheduledOn);
    const limits = limitsFrom(await getProfile());
    const ignore = waiting.flatMap((w) => [w.id, w.replacesId]);
    const clash = await checkSchedule(db, dated.map((w) => planned(w, w.scheduledOn!)), limits, ignore);
    if (clash) return { error: clash };
  }
  const changes: StatusChange[] = [];
  for (const workout of waiting) changes.push(...((await decide(db, workout.id, decision)) ?? []));
  revalidatePath("/", "layout");
  return { changes };
}
