// Planned against done, week by week. Run in tests too: relative imports only.
import { addDays } from "../../lib/dates";
import { runTotals, type Match, type Run, type RunTotals } from "../../lib/runs";
import { HARD_TYPES, type Workout, estimateMinutes } from "../../lib/workout";

export interface WeekSummary {
  weekOf: string;
  plannedMinutes: number;
  doneMinutes: number;
  done: number;
  skipped: number;
  /** Days that have passed with the workout not marked either way. */
  unmarked: number;
  /** Share of planned minutes in hard sessions, 0 to 1; null with nothing planned. */
  hardShare: number | null;
  /** What Garmin recorded, planned or not. Kept apart from the estimates above. */
  ran: RunTotals;
}

/**
 * One summary per Monday, from approved workouts. Minutes are estimates from the
 * steps. A workout counts as done when the athlete marked it or a run matched it.
 */
export function weeklySummary(
  workouts: Workout[],
  mondays: string[],
  today: string,
  matches: Map<number, Match> = new Map(),
  runs: Run[] = [],
): WeekSummary[] {
  const outcome = (w: Workout) => (matches.has(w.id) ? matches.get(w.id)!.outcome : w.outcome);
  return mondays.map((monday) => {
    const sunday = addDays(monday, 6);
    const week = workouts.filter((w) => w.scheduledOn && w.scheduledOn >= monday && w.scheduledOn <= sunday);
    const minutes = (list: Workout[]) => Math.round(list.reduce((n, w) => n + estimateMinutes(w.steps), 0));
    const planned = minutes(week);
    return {
      weekOf: monday,
      plannedMinutes: planned,
      doneMinutes: minutes(week.filter((w) => outcome(w) === "done")),
      done: week.filter((w) => outcome(w) === "done").length,
      skipped: week.filter((w) => outcome(w) === "skipped").length,
      unmarked: week.filter((w) => !outcome(w) && w.scheduledOn! < today).length,
      hardShare: planned ? minutes(week.filter((w) => HARD_TYPES.includes(w.type))) / planned : null,
      ran: runTotals(runs.filter((r) => r.on >= monday && r.on <= sunday)),
    };
  });
}

/** Done as a share of workouts whose day has come, 0 to 1; null when none has. */
export function consistency(weeks: WeekSummary[]): number | null {
  const due = weeks.reduce((n, w) => n + w.done + w.skipped + w.unmarked, 0);
  return due ? weeks.reduce((n, w) => n + w.done, 0) / due : null;
}
