// Takes the database as an argument so tests can use their own.
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Block, Plan } from "../../lib/plans";
import { trainingBlocks, trainingPlans } from "../db/schema";
import type { BlockInput, PlanInput } from "./validation";

type Db = NodePgDatabase;
type Reader = Pick<NodePgDatabase, "select">;
type BlockRow = typeof trainingBlocks.$inferSelect;

const toBlock = (row: BlockRow): Block => ({
  id: row.id,
  planId: row.planId,
  name: row.name,
  focus: row.focus,
  startOn: row.startOn,
  endOn: row.endOn,
  weeklyMinutes: row.weeklyMinutes,
  notes: row.notes,
});

/** Approved blocks only: proposals are shown in the chat until approved. */
const approvedBlocks = (planId?: number) =>
  and(eq(trainingBlocks.status, "approved"), planId === undefined ? undefined : eq(trainingBlocks.planId, planId));

export async function listPlans(db: Reader): Promise<Plan[]> {
  const plans = await db.select().from(trainingPlans).orderBy(sql`${trainingPlans.endOn} desc`);
  const blocks = await db.select().from(trainingBlocks).where(approvedBlocks()).orderBy(asc(trainingBlocks.startOn));
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    goalId: plan.goalId,
    startOn: plan.startOn,
    endOn: plan.endOn,
    notes: plan.notes,
    blocks: blocks.filter((b) => b.planId === plan.id).map(toBlock),
  }));
}

export async function getPlan(db: Reader, id: number): Promise<Plan | undefined> {
  return (await listPlans(db)).find((plan) => plan.id === id);
}

export async function createPlan(db: Db, plan: PlanInput): Promise<number> {
  const [row] = await db.insert(trainingPlans).values(plan).returning({ id: trainingPlans.id });
  return row!.id;
}

export async function updatePlan(db: Db, id: number, plan: PlanInput) {
  await db.update(trainingPlans).set({ ...plan, updatedAt: new Date() }).where(eq(trainingPlans.id, id));
}

export async function deletePlan(db: Db, id: number) {
  await db.delete(trainingPlans).where(eq(trainingPlans.id, id));
}

export async function saveBlock(db: Db, planId: number, block: BlockInput, id?: number): Promise<number> {
  if (id !== undefined) {
    await db
      .update(trainingBlocks)
      .set({ ...block, updatedAt: new Date() })
      .where(and(eq(trainingBlocks.id, id), eq(trainingBlocks.planId, planId)));
    return id;
  }
  const [row] = await db.insert(trainingBlocks).values({ ...block, planId }).returning({ id: trainingBlocks.id });
  return row!.id;
}

export async function deleteBlock(db: Db, planId: number, id: number) {
  await db.delete(trainingBlocks).where(and(eq(trainingBlocks.id, id), eq(trainingBlocks.planId, planId)));
}

/** Approved blocks touching from..to, with their plan's name. */
export async function blocksBetween(db: Reader, from: string, to: string) {
  const rows = await db
    .select({ block: trainingBlocks, planName: trainingPlans.name })
    .from(trainingBlocks)
    .innerJoin(trainingPlans, eq(trainingPlans.id, trainingBlocks.planId))
    .where(and(approvedBlocks(), sql`${trainingBlocks.startOn} <= ${to} and ${trainingBlocks.endOn} >= ${from}`))
    .orderBy(asc(trainingBlocks.startOn));
  return rows.map((row) => ({ ...toBlock(row.block), planName: row.planName }));
}
