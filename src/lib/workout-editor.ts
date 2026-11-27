// The Studio's form state, and turning it into what readProposal checks.
import { formatPace, type Step, type StepKind, type Workout, type WorkoutType } from "./workout";
import { formatDuration, parseDuration, parseKilometres } from "./units";

export interface DraftStep {
  kind: StepKind;
  measure: "time" | "distance";
  /** Minutes ("10", "2.5"), m:ss or h:mm:ss for time; kilometres for distance. */
  amount: string;
  paceFastest: string;
  paceSlowest: string;
  heartRateMin: string;
  heartRateMax: string;
  intensity: string;
  instructions: string;
  repeatCount: string;
  steps: DraftStep[];
}

export interface Draft {
  title: string;
  type: WorkoutType;
  date: string;
  description: string;
  steps: DraftStep[];
}

export function emptyStep(kind: StepKind = "run"): DraftStep {
  return {
    kind,
    measure: "time",
    amount: kind === "repeat" ? "" : "10",
    paceFastest: "",
    paceSlowest: "",
    heartRateMin: "",
    heartRateMax: "",
    intensity: "",
    instructions: "",
    repeatCount: kind === "repeat" ? "4" : "",
    steps: kind === "repeat" ? [emptyStep("run"), emptyStep("recovery")] : [],
  };
}

function draftStep(step: Step): DraftStep {
  const distance = step.distanceMetres !== null;
  const seconds = step.durationSeconds ?? 0;
  return {
    kind: step.kind,
    measure: distance ? "distance" : "time",
    amount: distance
      ? String(step.distanceMetres! / 1000)
      : step.kind === "repeat"
        ? ""
        : seconds % 60 === 0 && seconds < 3600
          ? String(seconds / 60)
          : formatDuration(seconds),
    paceFastest: step.paceFastest === null ? "" : formatPace(step.paceFastest),
    paceSlowest: step.paceSlowest === null ? "" : formatPace(step.paceSlowest),
    heartRateMin: step.heartRateMin === null ? "" : String(step.heartRateMin),
    heartRateMax: step.heartRateMax === null ? "" : String(step.heartRateMax),
    intensity: step.intensity ?? "",
    instructions: step.instructions ?? "",
    repeatCount: step.repeatCount === null ? "" : String(step.repeatCount),
    steps: step.steps.map(draftStep),
  };
}

export function toDraft(workout: Workout): Draft {
  return {
    title: workout.title,
    type: workout.type,
    date: workout.scheduledOn ?? "",
    description: workout.description,
    steps: workout.steps.map(draftStep),
  };
}

const KIND_NAMES: Record<StepKind, string> = {
  warmup: "warm-up",
  run: "run",
  recovery: "recovery",
  cooldown: "cool-down",
  repeat: "repeat",
};

/** Minutes from "10", "2.5", "1:30" (m:ss) or "1:05:00". */
function minutes(text: string): number | null {
  const plain = text.trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(plain)) return Number(plain) > 0 ? Number(plain) : null;
  const seconds = parseDuration(plain);
  return seconds === null ? null : seconds / 60;
}

function heartRate(text: string, label: string): number | null | string {
  if (!text.trim()) return null;
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 60 && value <= 220 ? value : `${label} must be a whole number from 60 to 220.`;
}

/**
 * The tool-input shape readProposal checks, or a message naming the step that
 * needs fixing. The same checks then apply as to the coach's proposals.
 */
export function draftToInput(draft: Draft): object | string {
  const convert = (step: DraftStep, where: string): object | string => {
    const name = `${where} (${KIND_NAMES[step.kind]})`;
    let duration: number | null = null;
    let distance: number | null = null;
    if (step.kind !== "repeat") {
      if (step.measure === "time") {
        duration = minutes(step.amount);
        if (duration === null) return `${name}: enter the time as minutes, m:ss or h:mm:ss.`;
      } else {
        const metres = parseKilometres(step.amount);
        if (metres === null) return `${name}: enter the distance in kilometres, such as 0.4 or 5.`;
        distance = metres / 1000;
      }
    }
    const hrMin = heartRate(step.heartRateMin, `${name}: lowest heart rate`);
    const hrMax = heartRate(step.heartRateMax, `${name}: highest heart rate`);
    if (typeof hrMin === "string") return hrMin;
    if (typeof hrMax === "string") return hrMax;
    let inner: object[] | null = null;
    if (step.kind === "repeat") {
      inner = [];
      for (const [n, child] of step.steps.entries()) {
        const converted = convert(child, `${where}.${n + 1}`);
        if (typeof converted === "string") return converted;
        inner.push(converted);
      }
    }
    const repeatCount = Number(step.repeatCount);
    if (step.kind === "repeat" && !(Number.isInteger(repeatCount) && repeatCount >= 2 && repeatCount <= 50)) {
      return `${name}: repeat it 2 to 50 times.`;
    }
    return {
      kind: step.kind,
      repeat_count: step.kind === "repeat" ? repeatCount : null,
      steps: inner,
      duration_minutes: duration,
      distance_km: distance,
      pace_fastest: step.paceFastest.trim() || null,
      pace_slowest: step.paceSlowest.trim() || null,
      heart_rate_min: hrMin,
      heart_rate_max: hrMax,
      intensity: step.intensity.trim() || null,
      instructions: step.instructions.trim() || null,
    };
  };

  if (!draft.steps.length) return "Add at least one step.";
  const steps: object[] = [];
  for (const [index, step] of draft.steps.entries()) {
    const converted = convert(step, `Step ${index + 1}`);
    if (typeof converted === "string") return converted;
    steps.push(converted);
  }
  return {
    title: draft.title,
    type: draft.type,
    date: draft.date || null,
    description: draft.description,
    replaces: null,
    steps,
  };
}
