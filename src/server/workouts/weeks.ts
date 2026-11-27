// Proposed weeks: reading the coach's input, and storing and loading them.
// Takes the database as an argument so tests can use their own.
import { asc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { addDays, isDate, isoWeekday } from "../../lib/dates";
import type { WeekPlan } from "../../lib/workout";
import { plannedWorkouts, weekProposals } from "../db/schema";
import { type Proposal, readProposal, WORKOUT_PROPERTIES } from "./proposal";
import { type Link, saveProposal, withSteps } from "./store";

type Db = NodePgDatabase;
type Reader = Pick<NodePgDatabase, "select">;

export const PROPOSE_WEEK_TOOL = {
  name: "propose_week",
  description:
    "Show the athlete a whole training week, Monday to Sunday, as one card. Use it when they " +
    "ask for a week or for what to do over the coming days. Read get_schedule first. Give " +
    "every day of the week, with a workout or none (a rest day), and a short note. Each " +
    "workout is approved or declined on its own, and the app checks the week against its " +
    "rules (no hard sessions on consecutive days, at most three a week, about 10% growth on " +
    "the week before, each day's available minutes).",
  input_schema: {
    type: "object",
    properties: {
      week_start: { type: "string", description: "The Monday, YYYY-MM-DD." },
      summary: { type: "string", description: "The week's aim, in a sentence or two." },
      days: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD, within the week." },
            note: { type: ["string", "null"], description: "A short note, such as 'Rest' or 'Easy if tired'." },
            workout: {
              anyOf: [
                {
                  type: "object",
                  properties: WORKOUT_PROPERTIES,
                  required: ["title", "type", "description", "steps"],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
          },
          required: ["date", "note", "workout"],
          additionalProperties: false,
        },
      },
    },
    required: ["week_start", "summary", "days"],
    additionalProperties: false,
  },
} as const;

const weekSchema = z.object({
  week_start: z.string().refine((d) => isDate(d) && isoWeekday(d) === 1, "must be a Monday, YYYY-MM-DD"),
  summary: z.string().trim().min(1).max(1000),
  days: z
    .array(
      z.object({
        date: z.string().refine(isDate, "must be YYYY-MM-DD"),
        note: z.string().trim().max(300).nullish(),
        workout: z.record(z.string(), z.unknown()).nullish(),
      }),
    )
    .min(1)
    .max(7),
});

export interface WeekInput {
  weekStart: string;
  summary: string;
  days: { date: string; note: string | null; proposal: Proposal | null }[];
}

/** The week, or what is wrong with it, worded for the coach to fix. */
export function readWeek(input: unknown): WeekInput | string {
  const parsed = weekSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return `Invalid week at ${issue?.path.join(".") || "the top level"}: ${issue?.message}`;
  }
  const { week_start: weekStart, summary } = parsed.data;
  const end = addDays(weekStart, 6);
  const seen = new Set<string>();
  const days: WeekInput["days"] = [];
  for (const day of parsed.data.days) {
    if (day.date < weekStart || day.date > end) return `${day.date} is not in the week of ${weekStart}.`;
    if (seen.has(day.date)) return `${day.date} appears twice.`;
    seen.add(day.date);
    let proposal: Proposal | null = null;
    if (day.workout) {
      const read = readProposal({ ...day.workout, date: day.date, replaces: null });
      if (typeof read === "string") return `${day.date}: ${read}`;
      proposal = read;
    }
    days.push({ date: day.date, note: day.note || null, proposal });
  }
  if (!days.some((day) => day.proposal)) return "The week has no workouts. Propose at least one.";
  return { weekStart, summary, days: days.sort((a, b) => a.date.localeCompare(b.date)) };
}

/** Saves the week and its workouts as proposals, all or nothing. */
export function saveWeek(db: Db, week: WeekInput, link: Link): Promise<number> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(weekProposals)
      .values({
        weekStart: week.weekStart,
        summary: week.summary,
        dayNotes: week.days.filter((d) => d.note).map((d) => ({ date: d.date, note: d.note! })),
        conversationId: link.conversationId,
        messageId: link.messageId,
        mock: link.mock,
      })
      .returning({ id: weekProposals.id });
    for (const day of week.days) {
      // A nested transaction: one savepoint per workout, inside this one.
      if (day.proposal) await saveProposal(tx as unknown as Db, day.proposal, { ...link, weekProposalId: row!.id });
    }
    return row!.id;
  });
}

async function load(db: Reader, rows: (typeof weekProposals.$inferSelect)[]): Promise<WeekPlan[]> {
  if (!rows.length) return [];
  const workouts = await withSteps(
    db,
    await db
      .select()
      .from(plannedWorkouts)
      .where(inArray(plannedWorkouts.weekProposalId, rows.map((r) => r.id)))
      .orderBy(asc(plannedWorkouts.scheduledOn), asc(plannedWorkouts.id)),
  );
  return rows.map((row) => {
    const mine = workouts.filter((w) => w.weekProposalId === row.id);
    const dates = new Set([0, 1, 2, 3, 4, 5, 6].map((n) => addDays(row.weekStart, n)));
    // A workout moved out of the week since is still shown, under its new date.
    for (const workout of mine) if (workout.scheduledOn) dates.add(workout.scheduledOn);
    return {
      id: row.id,
      weekStart: row.weekStart,
      summary: row.summary,
      mock: row.mock,
      days: [...dates].sort().map((date) => ({
        date,
        note: row.dayNotes.find((d) => d.date === date)?.note ?? null,
        workouts: mine.filter((w) => w.scheduledOn === date),
      })),
    };
  });
}

export async function getWeek(db: Reader, id: number) {
  return (await load(db, await db.select().from(weekProposals).where(eq(weekProposals.id, id))))[0];
}

/** The week cards shown under each reply. */
export async function weeksForMessages(db: Reader, messageIds: number[]) {
  const byMessage = new Map<number, WeekPlan[]>();
  if (!messageIds.length) return byMessage;
  const rows = await db.select().from(weekProposals).where(inArray(weekProposals.messageId, messageIds));
  for (const week of await load(db, rows)) {
    const messageId = rows.find((r) => r.id === week.id)!.messageId!;
    byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), week]);
  }
  return byMessage;
}
