import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeStep, estimateMinutes } from "../../lib/workout";
import { deleteConversation, startExchange } from "../coach/conversations";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import { type Proposal, readProposal } from "./proposal";
import { breaksRule, type Limits } from "./rules";
import { proposeWorkout } from "./propose";
import { approvedWorkouts, decide, getWorkout, saveProposal, workoutsForMessages } from "./store";

const blank = {
  duration_minutes: null,
  distance_km: null,
  pace_fastest: null,
  pace_slowest: null,
  heart_rate_min: null,
  heart_rate_max: null,
  intensity: null,
  instructions: null,
};
const intervals = {
  title: "6 × 800 m",
  type: "vo2max",
  date: "2026-12-05",
  replaces: null,
  description: "Speed",
  steps: [
    { ...blank, kind: "warmup", repeat_count: null, steps: null, duration_minutes: 15 },
    {
      ...blank,
      kind: "repeat",
      repeat_count: 6,
      steps: [
        { ...blank, kind: "run", distance_km: 0.8, pace_fastest: "3:50", pace_slowest: "4:00", intensity: "hard" },
        { ...blank, kind: "recovery", duration_minutes: 2 },
      ],
    },
    { ...blank, kind: "cooldown", repeat_count: null, steps: null, duration_minutes: 10 },
  ],
};

describe("readProposal", () => {
  it("turns the tool input into steps", () => {
    const proposal = readProposal(intervals) as Proposal;
    expect(proposal.steps).toHaveLength(3);
    expect(proposal.steps[1]).toMatchObject({ kind: "repeat", repeatCount: 6 });
    expect(proposal.steps[1]?.steps.map(describeStep)).toEqual([
      "Run: 800 m, 3:50–4:00/km, hard",
      "Recovery: 2 min",
    ]);
    // 15 + 6 × (0.8 km at 4:00 + 2) + 10
    expect(estimateMinutes(proposal.steps)).toBeCloseTo(15 + 6 * (3.2 + 2) + 10);
  });

  it.each([
    [{ ...intervals, steps: [{ ...intervals.steps[0], duration_minutes: null }] }, /exactly one/],
    [{ ...intervals, steps: [{ ...intervals.steps[1], repeat_count: 1 }] }, /repeat_count/],
    [{ ...intervals, steps: [{ ...intervals.steps[0], pace_fastest: "fast" }] }, /m:ss/],
    [{ ...intervals, steps: [{ ...intervals.steps[0], pace_fastest: "5:00", pace_slowest: "4:00" }] }, /slower/],
    [{ ...intervals, type: "sprint" }, /type/],
  ])("explains what is wrong", (input, message) => {
    expect(readProposal(input)).toMatch(message);
  });
});

describe("breaksRule", () => {
  const proposal = readProposal(intervals) as Proposal;
  const free: Limits = { currentInjuries: [], maxMinutes: new Map() };

  it("allows a workout when nothing is in the way", () => {
    expect(breaksRule(proposal, free, "2026-11-28")).toBeUndefined();
    // A date it already had may stay, even once it has passed.
    expect(breaksRule(proposal, free, "2026-12-06", "2026-12-05")).toBeUndefined();
  });

  it("blocks hard sessions during an injury, but not easy ones", () => {
    const hurt = { ...free, currentInjuries: ["Calf"] };
    expect(breaksRule(proposal, hurt, "2026-11-28")?.message).toMatch(/injury is current \(Calf\)/);
    expect(breaksRule({ ...proposal, type: "easy" }, hurt, "2026-11-28")).toBeUndefined();
  });

  it("respects rest days, available minutes and the calendar", () => {
    // 5 December 2026 is a Saturday.
    expect(breaksRule(proposal, { ...free, maxMinutes: new Map([[6, 0]]) }, "2026-11-28")?.rule).toBe("rest");
    expect(breaksRule(proposal, { ...free, maxMinutes: new Map([[6, 45]]) }, "2026-11-28")?.message).toMatch(/than the 45 you have on Saturdays/);
    expect(breaksRule(proposal, free, "2026-12-06")?.rule).toBe("past");
  });
});

describe("workout storage", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  beforeAll(resetTestDatabase);
  afterAll(() => pool.end());

  it("saves steps in order, decides once, and keeps approved workouts when a chat goes", async () => {
    const chat = (await startExchange(db, undefined, "Plan something", false))!;
    const link = { conversationId: chat.conversationId, messageId: chat.replyId, mock: false };
    const proposal = readProposal(intervals) as Proposal;
    const { id: kept } = await saveProposal(db, proposal, link);
    const { id: dropped } = await saveProposal(db, { ...proposal, title: "Other" }, link);

    const saved = await getWorkout(db, kept);
    expect(saved?.steps).toEqual(proposal.steps);
    expect((await workoutsForMessages(db, [chat.replyId])).get(chat.replyId)).toHaveLength(2);

    expect(await decide(db, kept, "approved")).toEqual([{ id: kept, status: "approved" }]);
    expect(await decide(db, kept, "declined")).toEqual([{ id: kept, status: "approved" }]);
    expect(await decide(db, 999_999, "approved")).toBeUndefined();

    // The next message tells the coach what it proposed and what became of it.
    const next = (await startExchange(db, chat.conversationId, "Make it shorter", false))!;
    const told = next.history.find((m) => m.role === "assistant")?.content ?? "";
    expect(told).toContain(`#${kept}: "6 × 800 m", VO2max intervals, 2026-12-05; approved by the athlete.`);
    expect(told).toContain("    Run: 800 m, 3:50–4:00/km, hard");
    expect(told).toContain('"Other"');

    await deleteConversation(db, chat.conversationId);
    expect((await approvedWorkouts(db)).map((w) => w.title)).toEqual(["6 × 800 m"]);
    expect(await getWorkout(db, dropped)).toBeUndefined();
  });

  it("lets a revision take the place of the workout it changes", async () => {
    const chat = (await startExchange(db, undefined, "Plan", false))!;
    const link = { conversationId: chat.conversationId, messageId: chat.replyId, mock: false };
    const base = readProposal(intervals) as Proposal;
    const revise = (replacesId: number) => saveProposal(db, { ...base, replacesId }, link);
    const status = async (id: number) => (await getWorkout(db, id))?.status;

    // A waiting proposal steps aside at once, and comes back if the revision is declined.
    const { id: first } = await saveProposal(db, base, link);
    const second = await revise(first);
    expect(second.changes).toEqual([{ id: first, status: "replaced" }]);
    expect(await decide(db, second.id, "declined")).toEqual([
      { id: second.id, status: "declined" },
      { id: first, status: "proposed" },
    ]);

    // An approved workout stays until its revision is approved.
    await decide(db, first, "approved");
    const third = await revise(first);
    expect(third.changes).toEqual([]);
    expect(await status(first)).toBe("approved");
    expect(await decide(db, third.id, "approved")).toEqual([
      { id: third.id, status: "approved" },
      { id: first, status: "replaced" },
    ]);
    const approved = (await approvedWorkouts(db)).map((w) => w.id);
    expect(approved).toContain(third.id);
    expect(approved).not.toContain(first);
  });

  it("refuses to revise a workout from another chat", async () => {
    const one = (await startExchange(db, undefined, "One", false))!;
    const two = (await startExchange(db, undefined, "Two", false))!;
    const base = readProposal(intervals) as Proposal;
    const { id } = await saveProposal(db, base, { conversationId: one.conversationId, messageId: one.replyId, mock: false });
    const link = { conversationId: two.conversationId, messageId: two.replyId, mock: false };
    const result = await proposeWorkout(db, { ...intervals, date: null, replaces: id }, async () => ({ currentInjuries: [], maxMinutes: new Map() }), link, "2026-11-28");
    expect(result.outcome).toMatchObject({ is_error: true });
    expect(result.outcome.content).toContain(`no current workout #${id}`);
  });
});
