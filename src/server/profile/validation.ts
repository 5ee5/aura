import { z } from "zod";
import { WEEKDAYS, WORKOUT_TYPES } from "../../lib/profile-options";
import { parseDuration, parseKilometres } from "../../lib/units";

const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.trim() === "") ? null : value;
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable());

const text = (max: number) =>
  z.string("Required.").trim().min(1, "Required.").max(max, `At most ${max} characters.`);
const day = z.iso.date("Pick a date.");

function parsed(parse: (text: string) => number | null, message: string) {
  return z.string("Required.").transform((value, context) => {
    const result = parse(value);
    if (result === null) context.addIssue({ code: "custom", message });
    return result ?? z.NEVER;
  });
}
const distance = parsed(parseKilometres, "Enter kilometres, for example 21.1.");
const duration = parsed(parseDuration, "Enter a time as mm:ss or h:mm:ss.");

const wholeNumber = (max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number.")
    .transform(Number)
    .pipe(z.number().max(max, `At most ${max}.`));

export const aboutSchema = z.object({
  name: text(100),
  trainingPreferences: optional(text(4000)),
  preferredWorkoutTypes: z.array(z.enum(WORKOUT_TYPES)),
});

export const goalSchema = z.object({
  description: text(500),
  raceName: optional(text(200)),
  raceDate: optional(day),
  distanceMetres: optional(distance),
  targetSeconds: optional(duration),
  status: z.enum(["active", "achieved", "abandoned"]),
});

export const bestSchema = z.object({
  distanceMetres: distance,
  timeSeconds: duration,
  achievedOn: optional(day),
});

export const raceSchema = z.object({
  name: text(200),
  raceDate: day,
  distanceMetres: distance,
  elevationGainMetres: optional(wholeNumber(100_000)),
  surface: z.enum(["road", "trail", "track"]),
  timeSeconds: optional(duration),
  notes: optional(text(4000)),
});

export const injurySchema = z
  .object({
    bodyArea: text(100),
    description: text(2000),
    startedOn: day,
    resolvedOn: optional(day),
  })
  // "YYYY-MM-DD" strings sort as dates, with no time zone to shift them.
  .refine((injury) => !injury.resolvedOn || injury.resolvedOn >= injury.startedOn, {
    path: ["resolvedOn"],
    message: "Cannot be before the start date.",
  });

const LABELS: Record<string, string> = {
  name: "Name",
  trainingPreferences: "Training preferences",
  description: "Description",
  raceName: "Race name",
  raceDate: "Race date",
  distanceMetres: "Distance",
  targetSeconds: "Target time",
  timeSeconds: "Time",
  achievedOn: "Date",
  elevationGainMetres: "Elevation gain",
  notes: "Notes",
  bodyArea: "Body area",
  startedOn: "Started",
  resolvedOn: "Resolved",
};

export type Parsed<T> = { data: T; error?: never } | { data?: never; error: string };

export function parseWith<T>(schema: z.ZodType<T>, input: unknown): Parsed<T> {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data };
  const [issue] = result.error.issues;
  const label = LABELS[String(issue?.path[0])];
  return { error: label ? `${label}: ${issue?.message}` : (issue?.message ?? "Check the form.") };
}

export interface Day {
  weekday: number;
  maxMinutes: number;
  notes: string | null;
}

/** The weekly form: a day left blank has no entry; 0 minutes means a rest day. */
export function parseWeek(input: Record<string, unknown>): Parsed<Day[]> {
  const days: Day[] = [];
  for (const [index, label] of WEEKDAYS.entries()) {
    const weekday = index + 1;
    const day = parseWith(
      z.object({ maxMinutes: optional(wholeNumber(1440)), notes: optional(text(200)) }),
      { maxMinutes: input[`minutes_${weekday}`], notes: input[`notes_${weekday}`] },
    );
    if (day.error !== undefined) return { error: `${label}: ${day.error}` };
    const { maxMinutes, notes } = day.data;
    if (maxMinutes === null && notes !== null) return { error: `${label}: add the minutes too.` };
    if (maxMinutes !== null) days.push({ weekday, maxMinutes, notes });
  }
  return { data: days };
}
