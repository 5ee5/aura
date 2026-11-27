// Rules about how workouts sit together across days and weeks. Checked in code
// whenever a dated workout is proposed, approved, moved or edited.
import { addDays, isoWeekday, startOfWeek } from "../../lib/dates";
import { HARD_TYPES, type WorkoutType } from "../../lib/workout";

export interface Planned {
  id?: number;
  date: string;
  type: WorkoutType;
  minutes: number;
}

/** Most hard sessions in one Monday-to-Sunday week. */
export const MAX_HARD_PER_WEEK = 3;
/** A week's planned time may grow by this share, or by EXTRA_MINUTES, whichever is more. */
export const GROWTH = 0.1;
export const EXTRA_MINUTES = 30;
/** Below this, the previous week is too light to measure growth against. */
export const BASELINE_MINUTES = 90;

const hard = (p: Planned) => HARD_TYPES.includes(p.type);
const sum = (list: Planned[]) => list.reduce((total, p) => total + p.minutes, 0);
const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Why adding these workouts to what is already planned breaks a rule, worded
 * for the athlete; undefined if it does not. `existing` must cover from the
 * Monday before the earliest candidate's week to the Sunday after the latest.
 */
export function scheduleProblem(
  candidates: Planned[],
  existing: Planned[],
  maxMinutes: Map<number, number>,
): string | undefined {
  const ids = new Set(candidates.map((c) => c.id).filter((id) => id !== undefined));
  const all = [...existing.filter((p) => p.id === undefined || !ids.has(p.id)), ...candidates];
  const on = (date: string) => all.filter((p) => p.date === date);

  for (const date of new Set(candidates.map((c) => c.date))) {
    const max = maxMinutes.get(isoWeekday(date));
    const minutes = Math.round(sum(on(date)));
    if (max !== undefined && on(date).length > 1 && minutes > max) {
      return `${date} would have about ${minutes} minutes planned, more than the ${max} you have on ${DAY[isoWeekday(date)]}s.`;
    }
  }

  for (const candidate of candidates.filter(hard)) {
    for (const next of [addDays(candidate.date, -1), addDays(candidate.date, 1)]) {
      if (on(next).some(hard)) {
        return `Hard sessions on ${candidate.date} and ${next} would be on consecutive days. Leave an easier day between them.`;
      }
    }
  }

  for (const monday of new Set(candidates.map((c) => startOfWeek(c.date)))) {
    const week = all.filter((p) => p.date >= monday && p.date <= addDays(monday, 6));
    if (week.filter(hard).length > MAX_HARD_PER_WEEK) {
      return `The week of ${monday} would have ${week.filter(hard).length} hard sessions; at most ${MAX_HARD_PER_WEEK} are allowed.`;
    }
    const before = sum(all.filter((p) => p.date >= addDays(monday, -7) && p.date < monday));
    const total = sum(week);
    const limit = Math.max(before * (1 + GROWTH), before + EXTRA_MINUTES);
    if (before >= BASELINE_MINUTES && total > limit) {
      return (
        `The week of ${monday} would have about ${Math.round(total)} minutes planned, up from ` +
        `${Math.round(before)} the week before. Build by about 10% a week: at most ${Math.round(limit)}.`
      );
    }
  }
  return undefined;
}

/** The date range `existing` must cover for these candidates. */
export function scheduleWindow(dates: string[]): { from: string; to: string } {
  const sorted = [...dates].sort();
  return { from: addDays(startOfWeek(sorted[0]!), -7), to: addDays(startOfWeek(sorted.at(-1)!), 13) };
}
