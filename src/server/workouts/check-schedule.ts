// Loads what is already planned and applies the schedule rules.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { estimateMinutes, type Workout } from "../../lib/workout";
import type { Limits } from "./rules";
import { type Planned, scheduleProblem, scheduleWindow } from "./schedule";
import { approvedBetween } from "./store";

export const planned = (workout: Pick<Workout, "type" | "steps"> & { id?: number }, date: string): Planned => ({
  id: workout.id,
  date,
  type: workout.type,
  minutes: estimateMinutes(workout.steps),
});

/**
 * Schedule rules for these dated workouts against approved ones. Workouts in
 * `ignore` (ones being replaced) and skipped ones do not count.
 */
export async function checkSchedule(
  db: Pick<NodePgDatabase, "select">,
  candidates: Planned[],
  limits: Limits,
  ignore: (number | null | undefined)[] = [],
): Promise<string | undefined> {
  if (!candidates.length) return undefined;
  const { from, to } = scheduleWindow(candidates.map((c) => c.date));
  const skip = new Set(ignore.filter((id): id is number => typeof id === "number"));
  const existing = (await approvedBetween(db, from, to))
    .filter((w) => !skip.has(w.id) && w.outcome !== "skipped")
    .map((w) => planned(w, w.scheduledOn!));
  return scheduleProblem(candidates, existing, limits.maxMinutes);
}
