import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import * as store from "./store";
import { blockProblem, blockSchema, firstError, planSchema } from "./validation";

const plan = { name: "Marathon", goalId: "", startOn: "2027-01-04", endOn: "2027-04-25", notes: "" };
const block = { name: "Base 1", focus: "base", startOn: "2027-01-04", endOn: "2027-01-31", weeklyMinutes: "240", notes: "" };

describe("plan forms", () => {
  it("reads a plan and a block, turning blanks into null", () => {
    expect(planSchema.parse(plan)).toEqual({ ...plan, goalId: null, notes: null });
    expect(blockSchema.parse(block)).toMatchObject({ weeklyMinutes: 240, notes: null });
  });

  it.each([
    [planSchema, { ...plan, endOn: "2027-01-01" }, "End: cannot be before the start."],
    [planSchema, { ...plan, endOn: "2029-06-01" }, "at most two years"],
    [blockSchema, { ...block, focus: "speed" }, "Focus: pick one."],
    [blockSchema, { ...block, weeklyMinutes: "4h" }, "Weekly minutes: enter a whole number."],
  ] as const)("explains a mistake", (schema, input, message) => {
    const result = schema.safeParse(input);
    expect(result.success ? "" : firstError(result.error)).toContain(message);
  });

  it("keeps blocks inside the plan and apart from each other", () => {
    const others = [{ id: 1, name: "Base 1", startOn: "2027-01-04", endOn: "2027-01-31" }];
    expect(blockProblem({ startOn: "2027-02-01", endOn: "2027-02-28" }, plan, others)).toBeUndefined();
    expect(blockProblem({ startOn: "2027-01-25", endOn: "2027-02-14" }, plan, others)).toContain("overlaps “Base 1”");
    expect(blockProblem({ startOn: "2027-01-25", endOn: "2027-02-14" }, plan, others, 1)).toBeUndefined();
    expect(blockProblem({ startOn: "2027-04-19", endOn: "2027-05-02" }, plan, others)).toContain("within the plan");
  });
});

describe("plan storage", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  beforeAll(resetTestDatabase);
  afterAll(() => pool.end());

  it("saves plans with blocks in order and finds those touching a range", async () => {
    const id = await store.createPlan(db, planSchema.parse(plan));
    await store.saveBlock(db, id, blockSchema.parse({ ...block, name: "Build", focus: "build", startOn: "2027-02-01", endOn: "2027-03-28" }));
    await store.saveBlock(db, id, blockSchema.parse(block));
    expect((await store.getPlan(db, id))?.blocks.map((b) => b.name)).toEqual(["Base 1", "Build"]);
    expect((await store.blocksBetween(db, "2027-01-25", "2027-02-07")).map((b) => [b.name, b.planName])).toEqual([
      ["Base 1", "Marathon"],
      ["Build", "Marathon"],
    ]);
    await store.deletePlan(db, id);
    expect(await store.blocksBetween(db, "2027-01-01", "2027-12-31")).toEqual([]);
  });
});
