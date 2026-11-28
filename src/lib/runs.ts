// Runs recorded by the watch, and how they line up with planned workouts.
// Pure: used by the calendar, analytics and the coach alike.

/** An activity Garmin recorded. Runs are the ones whose type isRunType accepts. */
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

/** Activities of any sport. Same shape as a run. */
export type Activity = Run;

const LABELS: Record<string, string> = {
  running: "Run",
  trail_running: "Trail run",
  treadmill_running: "Treadmill run",
  indoor_running: "Indoor run",
  track_running: "Track run",
  cycling: "Ride",
  road_biking: "Road ride",
  mountain_biking: "Mountain bike ride",
  gravel_cycling: "Gravel ride",
  indoor_cycling: "Indoor ride",
  virtual_ride: "Virtual ride",
  walking: "Walk",
  hiking: "Hike",
  strength_training: "Strength",
  lap_swimming: "Pool swim",
  open_water_swimming: "Open-water swim",
  indoor_rowing: "Indoor row",
  rowing: "Row",
  stair_climbing: "Stairs",
  indoor_cardio: "Cardio",
  hiit: "HIIT",
  yoga: "Yoga",
  pilates: "Pilates",
  elliptical: "Elliptical",
  other: "Other activity",
};

/** "Road ride" for road_biking; unknown keys are spelled out. */
export function activityLabel(type: string): string {
  return LABELS[type] ?? type.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

export interface SportTotals {
  sessions: number;
  minutes: number;
}

/** Time by sport, most time first. */
export function otherTotals(activities: Activity[]): (SportTotals & { type: string })[] {
  const totals = new Map<string, SportTotals>();
  for (const a of activities) {
    const t = totals.get(a.type) ?? { sessions: 0, minutes: 0 };
    totals.set(a.type, { sessions: t.sessions + 1, minutes: t.minutes + a.durationSeconds / 60 });
  }
  return [...totals]
    .map(([type, t]) => ({ type, sessions: t.sessions, minutes: Math.round(t.minutes) }))
    .sort((a, b) => b.minutes - a.minutes);
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
