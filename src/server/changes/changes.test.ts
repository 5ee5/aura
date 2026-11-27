import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startExchange } from "../coach/conversations";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import { createPlan, getPlan, saveBlock } from "../plans/store";
import { blockSchema, planSchema } from "../plans/validation";
import { readProposal, type Proposal } from "../workouts/proposal";
import { decide, getWorkout, saveProposal } from "../workouts/store";
import { decideBlock, proposeBlock } from "./blocks";
import { decideChanges, proposeChanges } from "./changes";

const free = { currentInjuries: [], maxMinutes: new Map<number, number>() };
const run = (title: string, type: string, date: string) =>
  readProposal({ title, type, date, description: "x", replaces: null, steps: [{ kind: "run", duration_minutes: 40 }] }) as Proposal;

describe("coach proposals for plans and the calendar", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  let link: { conversationId: number; messageId: number; mock: boolean };
  beforeAll(async () => {
    await resetTestDatabase();
    const chat = (await startExchange(db, undefined, "Plan", false))!;
    link = { conversationId: chat.conversationId, messageId: chat.replyId, mock: false };
  });
  afterAll(() => pool.end());

  it("adds a block to a plan only once approved, and only if it still fits", async () => {
    const planId = await createPlan(db, planSchema.parse({ name: "Spring", startOn: "2027-01-04", endOn: "2027-04-25" }));
    const input = { plan_id: planId, name: "Base", focus: "base", start: "2027-01-04", end: "2027-01-31", weekly_minutes: 200, notes: null };
    const { block, outcome } = await proposeBlock(db, input, link);
    expect(outcome.is_error).toBeUndefined();
    expect((await getPlan(db, planId))?.blocks).toEqual([]);

    // Meanwhile the athlete adds a block of their own in the same weeks.
    const mine = await saveBlock(db, planId, blockSchema.parse({ name: "Mine", focus: "build", startOn: "2027-01-25", endOn: "2027-02-07" }));
    expect(await decideBlock(db, block!.id, "approved")).toEqual({ error: "It overlaps “Mine” (2027-01-25 to 2027-02-07)." });
    expect((await proposeBlock(db, { ...input, plan_id: 999_999 }, link)).outcome.content).toContain("no plan");

    await saveBlock(db, planId, blockSchema.parse({ name: "Mine", focus: "build", startOn: "2027-02-01", endOn: "2027-02-14" }), mine);
    expect(await decideBlock(db, block!.id, "approved")).toEqual({ status: "approved" });
    expect((await getPlan(db, planId))?.blocks.map((b) => b.name)).toEqual(["Base", "Mine"]);
  });

  it("moves and cancels approved workouts as one set, checked against the rules", async () => {
    const save = async (proposal: Proposal) => {
      const { id } = await saveProposal(db, proposal, link);
      await decide(db, id, "approved");
      return id;
    };
    const tempo = await save(run("Tempo", "tempo", "2027-03-02"));
    const hills = await save(run("Hills", "hills", "2027-03-04"));
    const easy = await save(run("Easy", "easy", "2027-03-06"));

    // Hills next to the tempo would be hard days back to back.
    const clash = await proposeChanges(db, { summary: "x", changes: [{ workout_id: hills, action: "move", date: "2027-03-03" }] }, async () => free, link, "2027-03-01");
    expect(clash.outcome.content).toContain("consecutive days");

    const ok = await proposeChanges(
      db,
      {
        summary: "Lighter week",
        changes: [
          { workout_id: hills, action: "cancel", date: null },
          { workout_id: easy, action: "move", date: "2027-03-07" },
        ],
      },
      async () => free,
      link,
      "2027-03-01",
    );
    expect(ok.changeSet?.changes.map((c) => [c.title, c.action, c.from, c.to])).toEqual([
      ["Hills", "cancel", "2027-03-04", null],
      ["Easy", "move", "2027-03-06", "2027-03-07"],
    ]);
    expect((await getWorkout(db, easy))?.scheduledOn).toBe("2027-03-06");
    expect(await decideChanges(db, ok.changeSet!.id, "approved", free, "2027-03-01")).toEqual({ status: "approved" });
    expect((await getWorkout(db, hills))?.status).toBe("cancelled");
    expect((await getWorkout(db, easy))?.scheduledOn).toBe("2027-03-07");
    expect((await getWorkout(db, tempo))?.scheduledOn).toBe("2027-03-02");

    // A set that is out of date by the time it is approved is refused.
    const stale = await proposeChanges(db, { summary: "x", changes: [{ workout_id: easy, action: "move", date: "2027-03-08" }] }, async () => free, link, "2027-03-01");
    await proposeChanges(db, { summary: "y", changes: [{ workout_id: easy, action: "move", date: "2027-03-09" }] }, async () => free, link, "2027-03-01")
      .then((other) => decideChanges(db, other.changeSet!.id, "approved", free, "2027-03-01"));
    expect((await decideChanges(db, stale.changeSet!.id, "approved", free, "2027-03-01")).error).toContain("has moved since");
  });
});
