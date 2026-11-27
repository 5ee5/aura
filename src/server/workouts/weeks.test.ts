import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteConversation, startExchange } from "../coach/conversations";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import { proposeWeek } from "./propose-week";
import { decide, getWorkout } from "./store";
import { getWeek, readWeek, weeksForMessages } from "./weeks";

const run = (minutes: number) => [{ kind: "run", duration_minutes: minutes }];
const workout = (title: string, type: string, minutes: number) => ({ title, type, description: "x", steps: run(minutes) });
const week = {
  week_start: "2027-01-04",
  summary: "Base week",
  days: [
    { date: "2027-01-04", note: "Rest", workout: null },
    { date: "2027-01-05", note: null, workout: workout("Easy", "easy", 40) },
    { date: "2027-01-07", note: null, workout: workout("Tempo", "tempo", 50) },
    { date: "2027-01-09", note: "Long", workout: workout("Long", "long", 90) },
  ],
};
const free = async () => ({ currentInjuries: [], maxMinutes: new Map<number, number>() });

describe("readWeek", () => {
  it("reads the days in order, dating each workout", () => {
    const read = readWeek({ ...week, days: [...week.days].reverse() });
    if (typeof read === "string") throw new Error(read);
    expect(read.days.map((d) => d.date)).toEqual(["2027-01-04", "2027-01-05", "2027-01-07", "2027-01-09"]);
    expect(read.days[1]?.proposal?.scheduledOn).toBe("2027-01-05");
  });

  it.each([
    [{ ...week, week_start: "2027-01-05" }, /Monday/],
    [{ ...week, days: [...week.days, { date: "2027-01-11", note: null, workout: null }] }, /not in the week/],
    [{ ...week, days: [week.days[1], week.days[1]] }, /twice/],
    [{ ...week, days: [week.days[0]] }, /no workouts/],
    [{ ...week, days: [{ ...week.days[1], workout: { ...workout("Bad", "sprint", 10) } }] }, /2027-01-05: Invalid workout/],
  ])("explains what is wrong", (input, message) => {
    expect(readWeek(input)).toMatch(message);
  });
});

describe("proposed weeks", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  beforeAll(resetTestDatabase);
  afterAll(() => pool.end());

  it("saves a week as separate proposals on one card, and checks it as a whole", async () => {
    const chat = (await startExchange(db, undefined, "Plan my week", false))!;
    const link = { conversationId: chat.conversationId, messageId: chat.replyId, mock: false };
    const result = await proposeWeek(db, week, free, link, "2027-01-01");
    expect(result.outcome.is_error).toBeUndefined();
    const saved = (await getWeek(db, result.week!.id))!;
    expect(saved.days.map((d) => [d.date, d.note, d.workouts.map((w) => w.title)])).toEqual([
      ["2027-01-04", "Rest", []],
      ["2027-01-05", null, ["Easy"]],
      ["2027-01-06", null, []],
      ["2027-01-07", null, ["Tempo"]],
      ["2027-01-08", null, []],
      ["2027-01-09", "Long", ["Long"]],
      ["2027-01-10", null, []],
    ]);
    expect((await weeksForMessages(db, [chat.replyId])).get(chat.replyId)).toHaveLength(1);

    // The coach is told about the week, and its card numbers, on the next turn.
    const next = (await startExchange(db, chat.conversationId, "Thanks", false))!;
    expect(next.history[1]?.content).toContain("[Week plan from 2027-01-04: Base week]");
    expect(next.history[1]?.content).toMatch(/Workout card #\d+: "Tempo"/);

    // Approve the tempo, then a second week's hard day beside it is refused.
    const tempo = saved.days[3]!.workouts[0]!;
    await decide(db, tempo.id, "approved");
    const clash = await proposeWeek(
      db,
      { ...week, days: [{ date: "2027-01-08", note: null, workout: workout("Hills", "hills", 40) }] },
      free,
      link,
      "2027-01-01",
    );
    expect(clash.outcome).toMatchObject({ is_error: true });
    expect(clash.outcome.content).toContain("consecutive days");

    // Deleting the chat keeps the approved workout and drops the rest.
    await deleteConversation(db, chat.conversationId);
    expect((await getWorkout(db, tempo.id))?.status).toBe("approved");
    expect(await getWeek(db, saved.id)).toBeUndefined();
  });

  it("refuses a week the athlete's injury or rest days rule out", async () => {
    const chat = (await startExchange(db, undefined, "Plan", false))!;
    const link = { conversationId: chat.conversationId, messageId: chat.replyId, mock: false };
    const hurt = async () => ({ currentInjuries: ["Knee"], maxMinutes: new Map<number, number>() });
    expect((await proposeWeek(db, week, hurt, link, "2027-01-01")).outcome.content).toContain("2027-01-07: Hard sessions");
    const restSaturday = async () => ({ currentInjuries: [], maxMinutes: new Map([[6, 0]]) });
    expect((await proposeWeek(db, week, restSaturday, link, "2027-01-01")).outcome.content).toContain("Saturday is a rest day");
  });
});
