import { setTimeout as sleep } from "node:timers/promises";
import type { CoachReply } from "./types";

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

/**
 * Stands in for Claude when there is no API key, and in tests. Ignores the
 * messages, except that asking for a "workout" proposes a canned one.
 */
export const mockReply: CoachReply = async function* (messages, signal, tools) {
  const wantsWorkout = /workout/i.test(messages.at(-1)?.content ?? "");
  if (wantsWorkout && tools) await tools.proposeWorkout(MOCK_WORKOUT);
  for (const word of (wantsWorkout && tools ? MOCK_WORKOUT_REPLY : MOCK_REPLY).split(/(?<= )/)) {
    try {
      await sleep(80, undefined, { signal });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
    yield word;
  }
};
