// Runs recorded by the watch, and how they line up with planned workouts.
// Pure: used by the calendar, analytics and the coach alike.

export interface Run {
  id: number;
  on: string;
  /** Garmin's type key, such as running or treadmill_running. */
  type: string;
  startLocal: string;
  distanceMetres: number | null;
  durationSeconds: number;
  averageHeartRate: number | null;
  trainingLoad: number | null;
}

export type Outcome = "done" | "skipped";

interface Planned {
  id: number;
  scheduledOn: string | null;
  /** Marked by the athlete; always wins. */
  outcome: Outcome | null;
  minutes: number;
}

export interface Match {
  /** The athlete's mark, else done when a run was matched. */
  outcome: Outcome | null;
  /** Who decided the outcome. */
  by: "athlete" | "garmin" | null;
  run?: Run;
}

/**
 * Pairs runs with planned workouts on the same day: the longest run with the
 * longest workout, and so on, one run each. A workout the athlete marked skipped
 * gets no run. Runs left over are returned as extras, by day.
 */
export function matchRuns(workouts: Planned[], runs: Run[]) {
  const matches = new Map<number, Match>();
  const extras = new Map<string, Run[]>();
  const runsByDay = new Map<string, Run[]>();
  for (const run of runs) runsByDay.set(run.on, [...(runsByDay.get(run.on) ?? []), run]);

  const byDay = new Map<string, Planned[]>();
  for (const w of workouts) {
    matches.set(w.id, { outcome: w.outcome, by: w.outcome ? "athlete" : null });
    if (w.scheduledOn && w.outcome !== "skipped") byDay.set(w.scheduledOn, [...(byDay.get(w.scheduledOn) ?? []), w]);
  }

  for (const [day, dayRuns] of runsByDay) {
    const longest = [...dayRuns].sort((a, b) => b.durationSeconds - a.durationSeconds || a.id - b.id);
    const planned = [...(byDay.get(day) ?? [])].sort((a, b) => b.minutes - a.minutes || a.id - b.id);
    planned.forEach((w, i) => {
      const run = longest[i];
      if (run) matches.set(w.id, { outcome: w.outcome ?? "done", by: w.outcome ? "athlete" : "garmin", run });
    });
    const left = longest.slice(planned.length).sort((a, b) => a.startLocal.localeCompare(b.startLocal));
    if (left.length) extras.set(day, left);
  }
  return { matches, extras };
}

export interface RunTotals {
  runs: number;
  /** Kilometres, one decimal. */
  km: number;
  minutes: number;
  /** Sum of Garmin's training load, over the runs that have one. */
  load: number;
  runsWithLoad: number;
}

export function runTotals(runs: Run[]): RunTotals {
  const withLoad = runs.filter((r) => r.trainingLoad !== null);
  return {
    runs: runs.length,
    km: Math.round(runs.reduce((n, r) => n + (r.distanceMetres ?? 0), 0) / 100) / 10,
    minutes: Math.round(runs.reduce((n, r) => n + r.durationSeconds, 0) / 60),
    load: Math.round(withLoad.reduce((n, r) => n + r.trainingLoad!, 0)),
    runsWithLoad: withLoad.length,
  };
}

/** "10.2 km, 55 min, 148 bpm" */
export function describeRun(run: Run): string {
  return [
    run.distanceMetres ? `${(run.distanceMetres / 1000).toFixed(1)} km` : null,
    `${Math.round(run.durationSeconds / 60)} min`,
    run.averageHeartRate ? `${run.averageHeartRate} bpm` : null,
  ]
    .filter(Boolean)
    .join(", ");
}
