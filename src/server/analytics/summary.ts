// Planned against done, week by week. Run in tests too: relative imports only.
import { addDays } from "../../lib/dates";
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
}

/** One summary per Monday, from approved workouts. Minutes are estimates from the steps. */
export function weeklySummary(workouts: Workout[], mondays: string[], today: string): WeekSummary[] {
  return mondays.map((monday) => {
    const week = workouts.filter((w) => w.scheduledOn && w.scheduledOn >= monday && w.scheduledOn <= addDays(monday, 6));
    const minutes = (list: Workout[]) => Math.round(list.reduce((n, w) => n + estimateMinutes(w.steps), 0));
    const planned = minutes(week);
    return {
      weekOf: monday,
      plannedMinutes: planned,
      doneMinutes: minutes(week.filter((w) => w.outcome === "done")),
      done: week.filter((w) => w.outcome === "done").length,
      skipped: week.filter((w) => w.outcome === "skipped").length,
      unmarked: week.filter((w) => !w.outcome && w.scheduledOn! < today).length,
      hardShare: planned ? minutes(week.filter((w) => HARD_TYPES.includes(w.type))) / planned : null,
    };
  });
}

/** Done as a share of workouts whose day has come, 0 to 1; null when none has. */
export function consistency(weeks: WeekSummary[]): number | null {
  const due = weeks.reduce((n, w) => n + w.done + w.skipped + w.unmarked, 0);
  return due ? weeks.reduce((n, w) => n + w.done, 0) / due : null;
}
