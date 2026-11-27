// Shared by the browser and the server: what a workout is, and how it reads.
import { formatDuration } from "./units";

export const WORKOUT_TYPES = {
  easy: "Easy run",
  recovery: "Recovery run",
  long: "Long run",
  tempo: "Tempo run",
  threshold: "Threshold intervals",
  vo2max: "VO2max intervals",
  hills: "Hill repeats",
  progression: "Progression run",
  trail: "Trail run",
  race_specific: "Race-specific workout",
} as const;
export type WorkoutType = keyof typeof WORKOUT_TYPES;
export const WORKOUT_TYPE_KEYS = Object.keys(WORKOUT_TYPES) as [WorkoutType, ...WorkoutType[]];

/** Not proposed while the athlete has a current injury. */
export const HARD_TYPES: readonly WorkoutType[] = ["tempo", "threshold", "vo2max", "hills", "race_specific"];

export const STEP_KINDS = ["warmup", "run", "recovery", "cooldown", "repeat"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface Step {
  kind: StepKind;
  /** Only for "repeat", which holds the steps it repeats. */
  repeatCount: number | null;
  durationSeconds: number | null;
  distanceMetres: number | null;
  /** Seconds per kilometre: fastest is the smaller number. */
  paceFastest: number | null;
  paceSlowest: number | null;
  heartRateMin: number | null;
  heartRateMax: number | null;
  intensity: string | null;
  instructions: string | null;
  steps: Step[];
}

export type WorkoutStatus = "proposed" | "approved" | "declined" | "replaced";

/** A card whose status changed as a result of something else. */
export interface StatusChange {
  id: number;
  status: WorkoutStatus;
}

export interface Workout {
  id: number;
  title: string;
  type: WorkoutType;
  /** YYYY-MM-DD, or null for "whenever suits". */
  scheduledOn: string | null;
  description: string;
  status: WorkoutStatus;
  /** Made by the mock coach. */
  mock: boolean;
  replacesId: number | null;
  steps: Step[];
}

const KIND_LABELS: Record<StepKind, string> = {
  warmup: "Warm-up",
  run: "Run",
  recovery: "Recovery",
  cooldown: "Cool-down",
  repeat: "Repeat",
};

export function formatPace(secondsPerKm: number): string {
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, "0")}`;
}

function amount(step: Step): string {
  if (step.distanceMetres !== null) {
    return step.distanceMetres < 1000 ? `${step.distanceMetres} m` : `${step.distanceMetres / 1000} km`;
  }
  const seconds = step.durationSeconds ?? 0;
  if (seconds < 60) return `${seconds} s`;
  return seconds % 60 === 0 && seconds < 3600 ? `${seconds / 60} min` : formatDuration(seconds);
}

/** One line, such as "Run: 1 km, 4:00–4:10/km, HR 165–175, hard". */
export function describeStep(step: Step): string {
  if (step.kind === "repeat") return `Repeat ${step.repeatCount} times:`;
  const parts = [amount(step)];
  const { paceFastest: fast, paceSlowest: slow } = step;
  if (fast !== null || slow !== null) {
    parts.push(fast !== null && slow !== null && fast !== slow
      ? `${formatPace(fast)}–${formatPace(slow)}/km`
      : `${formatPace((fast ?? slow)!)}/km`);
  }
  if (step.heartRateMin !== null || step.heartRateMax !== null) {
    parts.push(`HR ${[step.heartRateMin, step.heartRateMax].filter((n) => n !== null).join("–")}`);
  }
  if (step.intensity) parts.push(step.intensity);
  return `${KIND_LABELS[step.kind]}: ${parts.join(", ")}`;
}

/** The card as text, so the coach knows on later turns what it proposed and what became of it. */
export function summarizeWorkout(workout: Workout): string {
  const lines = (steps: Step[], indent: string): string[] =>
    steps.flatMap((step) => [indent + describeStep(step), ...lines(step.steps, indent + "  ")]);
  const status = {
    proposed: "not decided yet",
    approved: "approved by the athlete",
    declined: "declined by the athlete",
    replaced: "replaced by a newer version",
  }[workout.status];
  return [
    `[Workout card #${workout.id}: "${workout.title}", ${WORKOUT_TYPES[workout.type]}, ${workout.scheduledOn ?? "any day"}; ${status}.]`,
    ...lines(workout.steps, "  "),
  ].join("\n");
}

/** Rough minutes, assuming 6:00/km where a distance has no pace. Used for limits only. */
export function estimateMinutes(steps: Step[]): number {
  return steps.reduce((total, step) => {
    if (step.kind === "repeat") return total + (step.repeatCount ?? 1) * estimateMinutes(step.steps);
    if (step.durationSeconds !== null) return total + step.durationSeconds / 60;
    const pace = step.paceSlowest ?? step.paceFastest ?? 360;
    return total + ((step.distanceMetres ?? 0) / 1000) * (pace / 60);
  }, 0);
}
