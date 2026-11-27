// Takes the database as an argument so tests can use their own.
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { StatusChange, Step, Workout, WorkoutStatus } from "../../lib/workout";
import { changeProposals, plannedWorkouts, trainingBlocks, weekProposals, workoutSteps } from "../db/schema";
import type { Proposal } from "./proposal";

type Db = NodePgDatabase;
/** Reading works inside a transaction too. */
type Reader = Pick<NodePgDatabase, "select">;
type StepRow = typeof workoutSteps.$inferSelect;
type WorkoutRow = typeof plannedWorkouts.$inferSelect;

export interface Link {
  conversationId: number;
  messageId: number;
  mock: boolean;
  /** Set when the workout is part of a proposed week. */
  weekProposalId?: number;
}

async function insertSteps(db: Pick<Db, "insert">, workoutId: number, steps: Step[], parentId: number | null) {
  for (const [position, { steps: inner, ...step }] of steps.entries()) {
    const [row] = await db
      .insert(workoutSteps)
      .values({ ...step, workoutId, parentId, position })
      .returning({ id: workoutSteps.id });
    if (inner.length) await insertSteps(db, workoutId, inner, row!.id);
  }
}

/** Saves the athlete's edits: the details and every step, replacing the old steps. */
export function updateWorkout(db: Db, id: number, edited: Omit<Proposal, "replacesId">) {
  return db.transaction(async (tx) => {
    await tx
      .update(plannedWorkouts)
      .set({
        title: edited.title,
        type: edited.type,
        scheduledOn: edited.scheduledOn,
        description: edited.description,
        updatedAt: new Date(),
      })
      .where(eq(plannedWorkouts.id, id));
    await tx.delete(workoutSteps).where(eq(workoutSteps.workoutId, id));
    await insertSteps(tx, id, edited.steps, null);
  });
}

/** Whether a proposal may replace this workout: one from the same chat, still current. */
export async function canReplace(db: Reader, id: number, conversationId: number) {
  const [found] = await db
    .select({ status: plannedWorkouts.status })
    .from(plannedWorkouts)
    .where(and(eq(plannedWorkouts.id, id), eq(plannedWorkouts.conversationId, conversationId)));
  return found?.status === "proposed" || found?.status === "approved";
}

/**
 * Saves a proposal. A revision of a workout still waiting for a decision takes
 * its place at once; an approved one is replaced only when the revision is approved.
 */
export function saveProposal(
  db: Db,
  proposal: Proposal,
  link: Link,
): Promise<{ id: number; changes: StatusChange[] }> {
  return db.transaction(async (tx) => {
    const [workout] = await tx
      .insert(plannedWorkouts)
      .values({
        title: proposal.title,
        type: proposal.type,
        scheduledOn: proposal.scheduledOn,
        description: proposal.description,
        replacesId: proposal.replacesId,
        ...link,
      })
      .returning({ id: plannedWorkouts.id });
    const workoutId = workout!.id;
    await insertSteps(tx, workoutId, proposal.steps, null);
    const changes: StatusChange[] = [];
    if (proposal.replacesId !== null) {
      const replaced = await tx
        .update(plannedWorkouts)
        .set({ status: "replaced" })
        .where(and(eq(plannedWorkouts.id, proposal.replacesId), eq(plannedWorkouts.status, "proposed")))
        .returning({ id: plannedWorkouts.id });
      changes.push(...replaced.map(({ id }) => ({ id, status: "replaced" as const })));
    }
    return { id: workoutId, changes };
  });
}

function nest(rows: StepRow[], parentId: number | null): Step[] {
  return rows
    .filter((row) => row.parentId === parentId)
    .map((row) => ({
      kind: row.kind,
      repeatCount: row.repeatCount,
      durationSeconds: row.durationSeconds,
      distanceMetres: row.distanceMetres,
      paceFastest: row.paceFastest,
      paceSlowest: row.paceSlowest,
      heartRateMin: row.heartRateMin,
      heartRateMax: row.heartRateMax,
      intensity: row.intensity,
      instructions: row.instructions,
      steps: nest(rows, row.id),
    }));
}

export async function withSteps(db: Reader, rows: WorkoutRow[]): Promise<(Workout & { messageId: number | null; weekProposalId: number | null })[]> {
  if (!rows.length) return [];
  const steps = await db
    .select()
    .from(workoutSteps)
    .where(inArray(workoutSteps.workoutId, rows.map((row) => row.id)))
    .orderBy(asc(workoutSteps.position), asc(workoutSteps.id));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    scheduledOn: row.scheduledOn,
    description: row.description,
    status: row.status,
    mock: row.mock,
    replacesId: row.replacesId,
    outcome: row.outcome,
    messageId: row.messageId,
    weekProposalId: row.weekProposalId,
    steps: nest(steps.filter((step) => step.workoutId === row.id), null),
  }));
}

export async function getWorkout(db: Reader, id: number) {
  const rows = await db.select().from(plannedWorkouts).where(eq(plannedWorkouts.id, id));
  return (await withSteps(db, rows))[0];
}

/** The cards shown under each reply. */
export async function workoutsForMessages(db: Reader, messageIds: number[]) {
  if (!messageIds.length) return new Map<number, Workout[]>();
  const rows = await db
    .select()
    .from(plannedWorkouts)
    // Workouts in a proposed week are shown on the week's card instead.
    .where(and(inArray(plannedWorkouts.messageId, messageIds), isNull(plannedWorkouts.weekProposalId)))
    .orderBy(asc(plannedWorkouts.id));
  const byMessage = new Map<number, Workout[]>();
  for (const workout of await withSteps(db, rows)) {
    byMessage.set(workout.messageId!, [...(byMessage.get(workout.messageId!) ?? []), workout]);
  }
  return byMessage;
}

/** Approved workouts: dated ones by date, then the rest, newest first. */
export async function approvedWorkouts(db: Db) {
  const rows = await db
    .select()
    .from(plannedWorkouts)
    .where(eq(plannedWorkouts.status, "approved"))
    .orderBy(sql`${plannedWorkouts.scheduledOn} asc nulls last`, sql`${plannedWorkouts.id} desc`);
  return withSteps(db, rows);
}

/** Approved workouts dated from..to, inclusive, by date. */
export async function approvedBetween(db: Reader, from: string, to: string) {
  const rows = await db
    .select()
    .from(plannedWorkouts)
    .where(
      and(
        eq(plannedWorkouts.status, "approved"),
        sql`${plannedWorkouts.scheduledOn} between ${from} and ${to}`,
      ),
    )
    .orderBy(asc(plannedWorkouts.scheduledOn), asc(plannedWorkouts.id));
  return withSteps(db, rows);
}

/** Approved workouts with no date yet, newest first. */
export async function unscheduledApproved(db: Reader) {
  const rows = await db
    .select()
    .from(plannedWorkouts)
    .where(and(eq(plannedWorkouts.status, "approved"), sql`${plannedWorkouts.scheduledOn} is null`))
    .orderBy(sql`${plannedWorkouts.id} desc`);
  return withSteps(db, rows);
}

/** Moves a workout to another day, or off the calendar; any done/skipped mark is cleared. */
export async function reschedule(db: Db, id: number, date: string | null) {
  await db
    .update(plannedWorkouts)
    .set({ scheduledOn: date, outcome: null, updatedAt: new Date() })
    .where(eq(plannedWorkouts.id, id));
}

export async function setOutcome(db: Db, id: number, outcome: "done" | "skipped" | null) {
  await db.update(plannedWorkouts).set({ outcome, updatedAt: new Date() }).where(eq(plannedWorkouts.id, id));
}

/**
 * Approves or declines a proposal once. Approving a revision retires the
 * workout it replaces; declining one brings back a version it had set aside.
 * Returns every card whose status changed, this one first.
 */
export function decide(
  db: Db,
  id: number,
  status: "approved" | "declined",
): Promise<StatusChange[] | undefined> {
  return db.transaction(async (tx) => {
    const [changed] = await tx
      .update(plannedWorkouts)
      .set({ status })
      .where(and(eq(plannedWorkouts.id, id), eq(plannedWorkouts.status, "proposed")))
      .returning({ status: plannedWorkouts.status, replacesId: plannedWorkouts.replacesId });
    if (!changed) {
      const [current] = await tx
        .select({ status: plannedWorkouts.status })
        .from(plannedWorkouts)
        .where(eq(plannedWorkouts.id, id));
      return current && [{ id, status: current.status }];
    }
    const changes: StatusChange[] = [{ id, status }];
    if (changed.replacesId !== null) {
      const [from, to]: [WorkoutStatus, WorkoutStatus] =
        status === "approved" ? ["approved", "replaced"] : ["replaced", "proposed"];
      const other = await tx
        .update(plannedWorkouts)
        .set({ status: to })
        .where(and(eq(plannedWorkouts.id, changed.replacesId), eq(plannedWorkouts.status, from)))
        .returning({ id: plannedWorkouts.id });
      changes.push(...other.map((row) => ({ id: row.id, status: to })));
    }
    return changes;
  });
}

/** Called before a chat is deleted: approved workouts outlive their chat. */
export async function deleteUnapproved(db: Pick<Db, "delete">, conversationId: number) {
  await db
    .delete(plannedWorkouts)
    .where(and(eq(plannedWorkouts.conversationId, conversationId), ne(plannedWorkouts.status, "approved")));
  await db.delete(weekProposals).where(eq(weekProposals.conversationId, conversationId));
  await db.delete(changeProposals).where(eq(changeProposals.conversationId, conversationId));
  await db
    .delete(trainingBlocks)
    .where(and(eq(trainingBlocks.conversationId, conversationId), ne(trainingBlocks.status, "approved")));
}

