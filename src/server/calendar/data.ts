import "server-only";
import { addDays, isoWeekday } from "@/lib/dates";
import { matchRuns, type Activity, type Match, type Run } from "@/lib/runs";
import { HARD_TYPES, type Workout, estimateMinutes } from "@/lib/workout";
import { activitiesBetween } from "@/server/activities/store";
import { isRunType } from "@/server/garmin/extract";
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
  /** Runs Garmin recorded that day that no planned workout took. */
  extraRuns: Run[];
  /** Rides, walks, strength and every other sport Garmin recorded that day. */
  others: Activity[];
}

/** A workout as the calendar shows it; with a match, done can come from a Garmin run. */
export const toEntry = (workout: Workout, match?: Match): EntryWorkout => ({
  id: workout.id,
  title: workout.title,
  type: workout.type,
  scheduledOn: workout.scheduledOn,
  outcome: match ? match.outcome : workout.outcome,
  marked: workout.outcome,
  run: match?.run,
  minutes: estimateMinutes(workout.steps),
  hard: HARD_TYPES.includes(workout.type),
});

/** Approved workouts and activities between two dates, with runs matched to workouts. */
export async function plannedAndRun(from: string, to: string) {
  const db = getDb();
  const [workouts, all] = await Promise.all([approvedBetween(db, from, to), activitiesBetween(db, from, to)]);
  const runs = all.filter((a) => isRunType(a.type));
  const others = all.filter((a) => !isRunType(a.type));
  const { matches, extras } = matchRuns(
    workouts.map((w) => ({ id: w.id, scheduledOn: w.scheduledOn, outcome: w.outcome, minutes: estimateMinutes(w.steps) })),
    runs,
  );
  return { workouts, runs, others, matches, extras };
}

/** Every day from..to inclusive, with what is planned on it. */
export async function calendarDays(from: string, to: string) {
  const db = getDb();
  const [{ workouts, matches, extras, others }, unscheduled, profile, blocks] = await Promise.all([
    plannedAndRun(from, to),
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
      workouts: workouts.filter((w) => w.scheduledOn === date).map((w) => toEntry(w, matches.get(w.id))),
      extraRuns: extras.get(date) ?? [],
      others: others.filter((a) => a.on === date),
    });
  }
  return { days, unscheduled: unscheduled.map((w) => toEntry(w)), blocks };
}
