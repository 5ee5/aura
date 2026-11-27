// What the coach sends to propose a workout, and turning it into steps.
// Run in tests too: relative imports only.
import { z } from "zod";
import { type Step, STEP_KINDS, WORKOUT_TYPE_KEYS, type WorkoutType, estimateMinutes } from "../../lib/workout";

const nullable = (type: string) => ({ type: [type, "null"] });

const STEP_FIELDS = {
  duration_minutes: { ...nullable("number"), description: "Length in minutes. Give this or distance_km, not both." },
  distance_km: { ...nullable("number"), description: "Length in kilometres. Give this or duration_minutes." },
  pace_fastest: { ...nullable("string"), description: "Fastest target pace per km, as m:ss." },
  pace_slowest: { ...nullable("string"), description: "Slowest target pace per km, as m:ss." },
  heart_rate_min: { ...nullable("integer"), description: "Lowest target heart rate, bpm." },
  heart_rate_max: { ...nullable("integer"), description: "Highest target heart rate, bpm." },
  intensity: { ...nullable("string"), description: "A few words, such as 'easy' or 'hard but controlled'." },
  instructions: { ...nullable("string"), description: "Coaching notes for this step." },
};
const SIMPLE_KINDS = STEP_KINDS.filter((kind) => kind !== "repeat");

const simpleStep = {
  type: "object",
  properties: { kind: { type: "string", enum: SIMPLE_KINDS }, ...STEP_FIELDS },
  required: ["kind", ...Object.keys(STEP_FIELDS)],
  additionalProperties: false,
};

const topStep = {
  type: "object",
  properties: {
    kind: { type: "string", enum: STEP_KINDS },
    repeat_count: { ...nullable("integer"), description: "Only for kind 'repeat': how many times." },
    steps: {
      anyOf: [{ type: "array", items: simpleStep }, { type: "null" }],
      description: "Only for kind 'repeat': the steps repeated, such as a run then a recovery.",
    },
    ...STEP_FIELDS,
  },
  required: ["kind", "repeat_count", "steps", ...Object.keys(STEP_FIELDS)],
  additionalProperties: false,
};

/** What describes one workout, without its date: shared with propose_week. */
export const WORKOUT_PROPERTIES = {
  title: { type: "string", description: "Short, such as '6 × 800 m at 5K pace'." },
  type: { type: "string", enum: WORKOUT_TYPE_KEYS },
  description: { type: "string", description: "What the session is for, in a sentence or two." },
  steps: { type: "array", items: topStep },
};

export const PROPOSE_WORKOUT_TOOL = {
  name: "propose_workout",
  description:
    "Show the athlete a structured workout as a card they can approve or decline. Use this " +
    "whenever you suggest a specific session, instead of writing its steps out in your reply. " +
    "Nothing is saved or scheduled unless the athlete approves it. If it is rejected, the " +
    "result says why: adjust and propose again, or explain.",
  // Not strict: the schema is large, and readProposal checks every field anyway.
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short, such as '6 × 800 m at 5K pace'." },
      type: { type: "string", enum: WORKOUT_TYPE_KEYS },
      date: { ...nullable("string"), description: "YYYY-MM-DD if it is for a particular day." },
      description: { type: "string", description: "What the session is for, in a sentence or two." },
      steps: { type: "array", items: topStep },
      replaces: {
        ...nullable("integer"),
        description:
          "When changing a workout from this chat, its card number (the # in its summary). " +
          "The new version then replaces it. Null for a new workout.",
      },
    },
    required: ["title", "type", "date", "description", "steps", "replaces"],
    additionalProperties: false,
  },
} as const;

const text = (max: number) => z.string().trim().max(max).nullish();
const fields = {
  duration_minutes: z.number().positive().max(360).nullish(),
  distance_km: z.number().positive().max(100).nullish(),
  pace_fastest: z.string().nullish(),
  pace_slowest: z.string().nullish(),
  heart_rate_min: z.number().int().min(60).max(220).nullish(),
  heart_rate_max: z.number().int().min(60).max(220).nullish(),
  intensity: text(100),
  instructions: text(1000),
};
const simpleSchema = z.object({ kind: z.enum(SIMPLE_KINDS as [string, ...string[]]), ...fields });
const proposalSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: z.enum(WORKOUT_TYPE_KEYS),
  date: z.iso.date().nullish(),
  description: z.string().trim().min(1).max(1000),
  replaces: z.number().int().positive().max(2_147_483_647).nullish(),
  steps: z
    .array(
      z.object({
        kind: z.enum(STEP_KINDS),
        repeat_count: z.number().int().nullish(),
        steps: z.array(simpleSchema).nullish(),
        ...fields,
      }),
    )
    .min(1)
    .max(20),
});

export interface Proposal {
  title: string;
  type: WorkoutType;
  scheduledOn: string | null;
  description: string;
  replacesId: number | null;
  steps: Step[];
}

/** "4:30" per km to seconds, within what a runner could mean. */
function pace(value: string | null | undefined): number | null | string {
  if (value === null || value === undefined || value.trim() === "") return null;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  const seconds = match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  return seconds >= 150 && seconds <= 720 ? seconds : `pace "${value}" is not m:ss per km between 2:30 and 12:00`;
}

type Raw = z.infer<typeof simpleSchema> & { repeat_count?: number | null; steps?: unknown[] | null };

function toStep(raw: Raw, where: string): Step | string {
  const fast = pace(raw.pace_fastest);
  const slow = pace(raw.pace_slowest);
  if (typeof fast === "string") return `${where}: ${fast}`;
  if (typeof slow === "string") return `${where}: ${slow}`;
  if (fast !== null && slow !== null && fast > slow) return `${where}: pace_fastest is slower than pace_slowest`;
  const { heart_rate_min: hrMin = null, heart_rate_max: hrMax = null } = raw;
  if (hrMin !== null && hrMax !== null && hrMin > hrMax) return `${where}: heart_rate_min is above heart_rate_max`;
  const duration = raw.duration_minutes ?? null;
  const distance = raw.distance_km ?? null;
  if (raw.kind !== "repeat" && (duration === null) === (distance === null)) {
    return `${where}: give exactly one of duration_minutes and distance_km`;
  }
  return {
    kind: raw.kind as Step["kind"],
    repeatCount: null,
    durationSeconds: duration === null ? null : Math.round(duration * 60),
    distanceMetres: distance === null ? null : Math.round(distance * 1000),
    paceFastest: fast,
    paceSlowest: slow,
    heartRateMin: hrMin,
    heartRateMax: hrMax,
    intensity: raw.intensity || null,
    instructions: raw.instructions || null,
    steps: [],
  };
}

/** The proposal, or what is wrong with it, worded for the coach to fix. */
export function readProposal(input: unknown): Proposal | string {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return `Invalid workout at ${issue?.path.join(".") || "the top level"}: ${issue?.message}`;
  }
  const steps: Step[] = [];
  for (const [index, raw] of parsed.data.steps.entries()) {
    const where = `step ${index + 1}`;
    if (raw.kind === "repeat") {
      const count = raw.repeat_count ?? 0;
      if (count < 2 || count > 50) return `${where}: repeat_count must be 2 to 50`;
      if (!raw.steps?.length || raw.steps.length > 10) return `${where}: a repeat needs 1 to 10 steps`;
      const inner: Step[] = [];
      for (const [n, child] of raw.steps.entries()) {
        const step = toStep(child, `${where}.${n + 1}`);
        if (typeof step === "string") return step;
        inner.push(step);
      }
      steps.push({ ...(toStep({ ...raw, kind: "repeat" }, where) as Step), repeatCount: count, durationSeconds: null, distanceMetres: null, steps: inner });
    } else {
      if (raw.steps?.length || raw.repeat_count) return `${where}: only a repeat can have repeat_count or steps`;
      const step = toStep(raw, where);
      if (typeof step === "string") return step;
      steps.push(step);
    }
  }
  if (estimateMinutes(steps) > 360) return "The workout is longer than six hours.";
  const { title, type, date, description, replaces } = parsed.data;
  return { title, type, scheduledOn: date ?? null, description, replacesId: replaces ?? null, steps };
}
