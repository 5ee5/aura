import "server-only";
import { addDays, isoWeekday } from "@/lib/dates";
import { HARD_TYPES, type Workout, estimateMinutes } from "@/lib/workout";
import { getDb } from "@/server/db/client";
import { blocksBetween } from "@/server/plans/store";
import { getProfile } from "@/server/profile/data";
import { approvedBetween, unscheduledApproved } from "@/server/workouts/store";
import type { EntryWorkout } from "@/app/(app)/calendar/entry";

export interface Day {
  date: string;
  rest: boolean;
  /** Race goals and past races on this day. */
  races: string[];
  workouts: EntryWorkout[];
}

export const toEntry = (workout: Workout): EntryWorkout => ({
  id: workout.id,
  title: workout.title,
  type: workout.type,
  scheduledOn: workout.scheduledOn,
  outcome: workout.outcome,
  minutes: estimateMinutes(workout.steps),
  hard: HARD_TYPES.includes(workout.type),
});

/** Every day from..to inclusive, with what is planned on it. */
export async function calendarDays(from: string, to: string) {
  const db = getDb();
  const [workouts, unscheduled, profile, blocks] = await Promise.all([
    approvedBetween(db, from, to),
    unscheduledApproved(db),
    getProfile(),
    blocksBetween(db, from, to),
  ]);
  const restDays = new Set(profile?.week.filter((d) => d.maxMinutes === 0).map((d) => d.weekday));
  const races = [
    ...(profile?.goals ?? [])
      .filter((g) => g.raceDate && g.status === "active")
      .map((g) => ({ date: g.raceDate!, name: g.raceName ?? g.description })),
    ...(profile?.races ?? []).map((r) => ({ date: r.raceDate, name: r.name })),
  ];
  const days: Day[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    days.push({
      date,
      rest: restDays.has(isoWeekday(date)),
      races: races.filter((race) => race.date === date).map((race) => race.name),
      workouts: workouts.filter((w) => w.scheduledOn === date).map(toEntry),
    });
  }
  return { days, unscheduled: unscheduled.map(toEntry), blocks };
}
