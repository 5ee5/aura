// propose_block: a training block for an existing plan, approved by the athlete.
// Takes the database as an argument so tests can use their own.
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BLOCK_FOCUS_KEYS, type BlockProposal } from "../../lib/plans";
import type { ToolOutcome } from "../coach/types";
import { trainingBlocks, trainingPlans } from "../db/schema";
import { getPlan } from "../plans/store";
import { blockProblem, blockSchema, firstError } from "../plans/validation";
import type { Link } from "../workouts/store";

type Db = NodePgDatabase;
type Reader = Pick<NodePgDatabase, "select">;

export const PROPOSE_BLOCK_TOOL = {
  name: "propose_block",
  description:
    "Propose a training block for one of the athlete's plans (plan ids are in get_schedule). " +
    "It is shown as a card and added to the plan only if they approve it. Blocks sit inside " +
    "the plan's dates and do not overlap approved blocks. Use it when asked to plan the coming " +
    "weeks or a phase of training; the weeks themselves are proposed later with propose_week.",
  input_schema: {
    type: "object",
    properties: {
      plan_id: { type: "integer" },
      name: { type: "string", description: "Short, such as 'Build 2'." },
      focus: { type: "string", enum: BLOCK_FOCUS_KEYS },
      start: { type: "string", description: "YYYY-MM-DD, usually a Monday." },
      end: { type: "string", description: "YYYY-MM-DD, usually a Sunday." },
      weekly_minutes: { type: ["integer", "null"], description: "A rough weekly target." },
      notes: { type: ["string", "null"], description: "What the block is for, and how weeks progress." },
    },
    required: ["plan_id", "name", "focus", "start", "end", "weekly_minutes", "notes"],
    additionalProperties: false,
  },
} as const;

async function load(db: Reader, rows: (typeof trainingBlocks.$inferSelect)[]): Promise<BlockProposal[]> {
  if (!rows.length) return [];
  const plans = await db
    .select({ id: trainingPlans.id, name: trainingPlans.name })
    .from(trainingPlans)
    .where(inArray(trainingPlans.id, rows.map((r) => r.planId)));
  return rows.map((row) => ({
    id: row.id,
    planId: row.planId,
    planName: plans.find((p) => p.id === row.planId)?.name ?? "",
    name: row.name,
    focus: row.focus,
    startOn: row.startOn,
    endOn: row.endOn,
    weeklyMinutes: row.weeklyMinutes,
    notes: row.notes,
    status: row.status === "approved" || row.status === "declined" ? row.status : "proposed",
    mock: row.mock,
  }));
}

export async function getBlockProposal(db: Reader, id: number) {
  return (await load(db, await db.select().from(trainingBlocks).where(eq(trainingBlocks.id, id))))[0];
}

export async function blocksForMessages(db: Reader, messageIds: number[]) {
  const byMessage = new Map<number, BlockProposal[]>();
  if (!messageIds.length) return byMessage;
  const rows = await db.select().from(trainingBlocks).where(inArray(trainingBlocks.messageId, messageIds));
  for (const block of await load(db, rows)) {
    const messageId = rows.find((r) => r.id === block.id)!.messageId!;
    byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), block]);
  }
  return byMessage;
}

export async function proposeBlock(db: Db, input: unknown, link: Link): Promise<{ outcome: ToolOutcome; block?: BlockProposal }> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const fail = (content: string) => ({ outcome: { content, is_error: true } });
  const planId = Number(raw.plan_id);
  const plan = Number.isInteger(planId) && planId > 0 ? await getPlan(db, planId) : undefined;
  if (!plan) return fail("There is no plan with that id. Ask the athlete to create a plan on the Plans page first.");
  const parsed = blockSchema.safeParse({
    name: raw.name,
    focus: raw.focus,
    startOn: raw.start,
    endOn: raw.end,
    weeklyMinutes: raw.weekly_minutes ?? null,
    notes: raw.notes ?? null,
  });
  if (!parsed.success) return fail(firstError(parsed.error));
  const problem = blockProblem(parsed.data, plan, plan.blocks);
  if (problem) return fail(`Rejected: ${problem}`);
  const [row] = await db
    .insert(trainingBlocks)
    .values({ ...parsed.data, planId, status: "proposed", ...link })
    .returning({ id: trainingBlocks.id });
  return {
    block: await getBlockProposal(db, row!.id),
    outcome: { content: "Shown to the athlete as a block card with Approve and Decline. It is not approved yet." },
  };
}

/** Approves a proposed block if it still fits, or declines it. Returns its status afterwards. */
export async function decideBlock(db: Db, id: number, decision: "approved" | "declined") {
  const block = await getBlockProposal(db, id);
  if (!block) return { error: "That block no longer exists." };
  if (block.status !== "proposed") return { status: block.status };
  if (decision === "approved") {
    const plan = await getPlan(db, block.planId);
    const problem = plan && blockProblem(block, plan, plan.blocks);
    if (!plan || problem) return { error: problem ?? "That plan no longer exists." };
  }
  await db
    .update(trainingBlocks)
    .set({ status: decision, updatedAt: new Date() })
    .where(and(eq(trainingBlocks.id, id), eq(trainingBlocks.status, "proposed")));
  return { status: decision };
}
