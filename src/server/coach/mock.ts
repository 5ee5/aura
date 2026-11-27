import { setTimeout as sleep } from "node:timers/promises";
import { addDays, localToday, startOfWeek } from "../../lib/dates";
import type { CoachReply, CoachTools } from "./types";

export const MOCK_REPLY =
  "This is a canned mock reply. No coach is connected yet, and nothing here is " +
  "training advice. It arrives a few words at a time so you can check how streaming " +
  "looks and try the Stop button. Your message reached the server, but it was not " +
  "read, analysed or saved.";

export const MOCK_WORKOUT_REPLY =
  "This is a canned mock workout, not advice. Approve or decline it to try the card.";

const MOCK_WORKOUT = {
  title: "Easy run with strides",
  type: "easy",
  date: null,
  replaces: null,
  description: "A canned example from the mock coach.",
  steps: [
    { kind: "warmup", duration_minutes: 10, intensity: "very easy" },
    { kind: "run", distance_km: 5, pace_fastest: "5:30", pace_slowest: "6:00", intensity: "easy" },
    {
      kind: "repeat",
      repeat_count: 4,
      steps: [
        { kind: "run", duration_minutes: 0.33, intensity: "fast, relaxed" },
        { kind: "recovery", duration_minutes: 1, intensity: "walk or jog" },
      ],
    },
    { kind: "cooldown", duration_minutes: 5 },
  ],
};

export const MOCK_WEEK_REPLY = "This is a canned mock week, not advice. Approve the days you want.";

const easy = (minutes: number) => [{ kind: "run", duration_minutes: minutes, intensity: "easy" }];

/** Next week, three easy runs: allowed even during an injury. */
function mockWeek() {
  const monday = addDays(startOfWeek(localToday()), 7);
  const day = (n: number) => addDays(monday, n);
  return {
    week_start: monday,
    summary: "A canned example week from the mock coach.",
    days: [
      { date: day(0), note: "Rest", workout: null },
      { date: day(1), note: null, workout: { title: "Easy 40", type: "easy", description: "Easy running.", steps: easy(40) } },
      { date: day(3), note: null, workout: { title: "Steady progression", type: "progression", description: "Easy, finishing a little quicker.", steps: [...easy(10), { kind: "run", duration_minutes: 20, intensity: "steady" }, ...easy(10)] } },
      { date: day(5), note: "Keep it relaxed", workout: { title: "Long easy run", type: "long", description: "Time on feet.", steps: easy(80) } },
    ],
  };
}

/** A four-week base block at the start of the plan that ends last. */
async function mockBlock(tools: CoachTools): Promise<string> {
  const today = localToday();
  const { plans } = JSON.parse((await tools.getSchedule({ from: today, to: today })).content) as {
    plans: { id: number; from: string }[];
  };
  const plan = plans[0];
  if (!plan) return "The mock coach needs a plan first: create one on the Plans page.";
  const { content, is_error: failed } = await tools.proposeBlock({
    plan_id: plan.id,
    name: "Mock base block",
    focus: "base",
    start: plan.from,
    end: addDays(plan.from, 27),
    weekly_minutes: 180,
    notes: "A canned example from the mock coach.",
  });
  return failed ? `The mock block was refused: ${content}` : "This is a canned mock block. Approve it to add it to the plan.";
}

/** Moves the next upcoming, unmarked workout one day later. */
async function mockMove(tools: CoachTools): Promise<string> {
  const today = localToday();
  const { weeks } = JSON.parse((await tools.getSchedule({ from: today, to: addDays(today, 56) })).content) as {
    weeks: { days: { date: string; workouts: { id: number; outcome?: string }[] }[] }[];
  };
  const next = weeks
    .flatMap((w) => w.days)
    .filter((d) => d.date >= today)
    .flatMap((d) => d.workouts.filter((w) => !w.outcome).map((w) => ({ ...w, date: d.date })))[0];
  if (!next) return "The mock coach found nothing upcoming to move.";
  const { content, is_error: failed } = await tools.proposeChanges({
    summary: "A canned example from the mock coach.",
    changes: [{ workout_id: next.id, action: "move", date: addDays(next.date, 1) }],
  });
  return failed ? `The mock change was refused: ${content}` : "These are canned mock changes. Approve them to apply.";
}

/**
 * Stands in for Claude when there is no API key, and in tests. Ignores the
 * messages, except that asking for a "workout" proposes a canned one.
 */
export const mockReply: CoachReply = async function* (messages, signal, tools) {
  const asked = messages.at(-1)?.content ?? "";
  let reply = MOCK_REPLY;
  // "How was my week?" is not a request for a plan.
  if (tools && /\bplan\b.*\bweek\b|\bweek\b.*\bplan\b/i.test(asked)) {
    const { content, is_error: failed } = await tools.proposeWeek(mockWeek());
    reply = failed ? `The mock week was refused: ${content}` : MOCK_WEEK_REPLY;
  } else if (tools && /\bblock\b/i.test(asked)) {
    reply = await mockBlock(tools);
  } else if (tools && /\bmove\b/i.test(asked)) {
    reply = await mockMove(tools);
  } else if (tools && /workout/i.test(asked)) {
    await tools.proposeWorkout(MOCK_WORKOUT);
    reply = MOCK_WORKOUT_REPLY;
  }
  for (const word of reply.split(/(?<= )/)) {
    try {
      await sleep(80, undefined, { signal });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
    yield word;
  }
};
