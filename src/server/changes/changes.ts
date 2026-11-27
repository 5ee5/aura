// propose_changes: moving or cancelling approved workouts, approved as one set.
// Takes the database as an argument so tests can use their own.
import { eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { isDate } from "../../lib/dates";
import type { Change, ChangeSet } from "../../lib/plans";
import type { ToolOutcome } from "../coach/types";
import { changeProposals, plannedWorkouts } from "../db/schema";
import { checkSchedule, planned } from "../workouts/check-schedule";
import { breaksRule, type Limits } from "../workouts/rules";
import { getWorkout, type Link } from "../workouts/store";

type Db = NodePgDatabase;
type Reader = Pick<NodePgDatabase, "select">;

export const PROPOSE_CHANGES_TOOL = {
  name: "propose_changes",
  description:
    "Propose moving approved workouts to other days, or cancelling them, as one set the athlete " +
    "approves or declines (workout ids are in get_schedule). Use it when they ask to rearrange " +
    "or lighten what is planned. To change a workout's content, use propose_workout with " +
    "replaces instead. The app checks the result against its rules.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Why, in a sentence." },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            workout_id: { type: "integer" },
            action: { type: "string", enum: ["move", "cancel"] },
            date: { type: ["string", "null"], description: "For move: the new day, YYYY-MM-DD." },
          },
          required: ["workout_id", "action", "date"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "changes"],
    additionalProperties: false,
  },
} as const;

const inputSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  changes: z
    .array(
      z.object({
        workout_id: z.number().int().positive(),
        action: z.enum(["move", "cancel"]),
        date: z.string().nullish(),
      }),
    )
    .min(1)
    .max(10),
});

/** Whether the changes may be made now: every workout still approved and where it was. */
async function check(db: Reader, changes: Change[], limits: Limits, today: string): Promise<string | undefined> {
  const ids = new Set<number>();
  const moved = [];
  for (const change of changes) {
    if (ids.has(change.workoutId)) return `Workout #${change.workoutId} appears twice.`;
    ids.add(change.workoutId);
    const workout = await getWorkout(db, change.workoutId);
    if (workout?.status !== "approved") return `Workout #${change.workoutId} is not an approved workout.`;
    if (workout.scheduledOn !== change.from) return `“${workout.title}” has moved since. Ask for the changes again.`;
    if (change.action === "move") {
      if (!change.to || !isDate(change.to)) return `Moving “${workout.title}” needs a date, YYYY-MM-DD.`;
      const broken = breaksRule({ ...workout, scheduledOn: change.to }, limits, today);
      if (broken) return `“${workout.title}” on ${change.to}: ${broken.message}`;
      moved.push(planned(workout, change.to));
    }
  }
  return checkSchedule(db, moved, limits, [...ids]);
}

async function load(db: Reader, rows: (typeof changeProposals.$inferSelect)[]): Promise<ChangeSet[]> {
  return rows.map((row) => ({
    id: row.id,
    summary: row.summary,
    changes: row.changes,
    status: row.status === "approved" || row.status === "declined" ? row.status : "proposed",
    mock: row.mock,
  }));
}

export async function getChangeSet(db: Reader, id: number) {
  return (await load(db, await db.select().from(changeProposals).where(eq(changeProposals.id, id))))[0];
}

export async function changesForMessages(db: Reader, messageIds: number[]) {
  const byMessage = new Map<number, ChangeSet[]>();
  if (!messageIds.length) return byMessage;
  const rows = await db.select().from(changeProposals).where(inArray(changeProposals.messageId, messageIds));
  for (const set of await load(db, rows)) {
    const messageId = rows.find((r) => r.id === set.id)!.messageId!;
    byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), set]);
  }
  return byMessage;
}

export async function proposeChanges(
  db: Db,
  input: unknown,
  limits: () => Promise<Limits>,
  link: Link,
  today: string,
): Promise<{ outcome: ToolOutcome; changeSet?: ChangeSet }> {
  const fail = (content: string) => ({ outcome: { content, is_error: true } });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail(`Invalid changes: ${parsed.error.issues[0]?.message}`);
  const changes: Change[] = [];
  for (const raw of parsed.data.changes) {
    const workout = await getWorkout(db, raw.workout_id);
    if (!workout) return fail(`There is no workout #${raw.workout_id}.`);
    changes.push({
      workoutId: workout.id,
      title: workout.title,
      action: raw.action,
      from: workout.scheduledOn,
      to: raw.action === "move" ? (raw.date ?? null) : null,
    });
  }
  const problem = await check(db, changes, await limits(), today);
  if (problem) return fail(`Rejected by a rule in the app: ${problem}`);
  const [row] = await db
    .insert(changeProposals)
    .values({ summary: parsed.data.summary, changes, ...link })
    .returning({ id: changeProposals.id });
  return {
    changeSet: await getChangeSet(db, row!.id),
    outcome: { content: "Shown to the athlete as a list of changes with Approve and Decline. Nothing has changed yet." },
  };
}

/** Applies the whole set if it still checks out, or declines it. */
export async function decideChanges(
  db: Db,
  id: number,
  decision: "approved" | "declined",
  limits: Limits,
  today: string,
): Promise<{ status?: ChangeSet["status"]; error?: string }> {
  const set = await getChangeSet(db, id);
  if (!set) return { error: "Those changes no longer exist." };
  if (set.status !== "proposed") return { status: set.status };
  if (decision === "approved") {
    const problem = await check(db, set.changes, limits, today);
    if (problem) return { error: problem };
  }
  await db.transaction(async (tx) => {
    if (decision === "approved") {
      for (const change of set.changes) {
        await tx
          .update(plannedWorkouts)
          .set(
            change.action === "cancel"
              ? { status: "cancelled", updatedAt: new Date() }
              : { scheduledOn: change.to, outcome: null, updatedAt: new Date() },
          )
          .where(eq(plannedWorkouts.id, change.workoutId));
      }
    }
    await tx.update(changeProposals).set({ status: decision, updatedAt: new Date() }).where(eq(changeProposals.id, id));
  });
  return { status: decision };
}
