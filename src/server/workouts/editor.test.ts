import { describe, expect, it } from "vitest";
import type { Workout } from "../../lib/workout";
import { draftToInput, emptyStep, toDraft } from "../../lib/workout-editor";
import { type Proposal, readProposal } from "./proposal";

const none = {
  repeatCount: null,
  durationSeconds: null,
  distanceMetres: null,
  paceFastest: null,
  paceSlowest: null,
  heartRateMin: null,
  heartRateMax: null,
  intensity: null,
  instructions: null,
  steps: [],
};
const workout: Workout = {
  id: 1,
  title: "Intervals",
  type: "vo2max",
  scheduledOn: "2026-12-05",
  description: "Speed",
  status: "approved",
  mock: false,
  replacesId: null,
  outcome: null,
  steps: [
    { ...none, kind: "warmup", durationSeconds: 900, intensity: "easy" },
    {
      ...none,
      kind: "repeat",
      repeatCount: 6,
      steps: [
        { ...none, kind: "run", distanceMetres: 800, paceFastest: 230, paceSlowest: 240, heartRateMax: 180 },
        { ...none, kind: "recovery", durationSeconds: 90, instructions: "jog" },
      ],
    },
    { ...none, kind: "cooldown", durationSeconds: 3900 },
  ],
};

describe("the Studio's form", () => {
  it("round-trips a workout without changing it", () => {
    const back = readProposal(draftToInput(toDraft(workout))) as Proposal;
    expect(back).toEqual({
      title: "Intervals",
      type: "vo2max",
      scheduledOn: "2026-12-05",
      description: "Speed",
      replacesId: null,
      steps: workout.steps,
    });
  });

  it("reads minutes typed plainly or as m:ss", () => {
    const draft = toDraft(workout);
    draft.steps[0] = { ...emptyStep("warmup"), amount: "12.5" };
    draft.steps[2] = { ...emptyStep("cooldown"), amount: "1:30" };
    const back = readProposal(draftToInput(draft)) as Proposal;
    expect(back.steps[0]?.durationSeconds).toBe(750);
    expect(back.steps[2]?.durationSeconds).toBe(90);
  });

  it.each([
    [(d: ReturnType<typeof toDraft>) => (d.steps[0]!.amount = "soon"), /Step 1 \(warm-up\): enter the time/],
    [(d: ReturnType<typeof toDraft>) => (d.steps[1]!.steps[0]!.amount = "far"), /Step 2\.1 \(run\): enter the distance/],
    [(d: ReturnType<typeof toDraft>) => (d.steps[1]!.repeatCount = "1"), /Step 2 \(repeat\): repeat it 2 to 50/],
    [(d: ReturnType<typeof toDraft>) => (d.steps[1]!.steps[0]!.heartRateMax = "300"), /highest heart rate must be/],
    [(d: ReturnType<typeof toDraft>) => (d.steps = []), /at least one step/],
  ])("names the step to fix", (change, message) => {
    const draft = toDraft(workout);
    change(draft);
    expect(draftToInput(draft)).toMatch(message);
  });
});
