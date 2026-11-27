import { describe, expect, it } from "vitest";
import type { Workout } from "../../lib/workout";
import { consistency, weeklySummary } from "./summary";

const workout = (scheduledOn: string, type: Workout["type"], minutes: number, outcome: Workout["outcome"]): Workout => ({
  id: 1,
  title: "x",
  type,
  scheduledOn,
  description: "",
  status: "approved",
  mock: false,
  replacesId: null,
  outcome,
  steps: [
    {
      kind: "run",
      repeatCount: null,
      durationSeconds: minutes * 60,
      distanceMetres: null,
      paceFastest: null,
      paceSlowest: null,
      heartRateMin: null,
      heartRateMax: null,
      intensity: null,
      instructions: null,
      steps: [],
    },
  ],
});

describe("weeklySummary", () => {
  it("adds up planned and done time, marks and the hard share", () => {
    const list = [
      workout("2026-11-23", "easy", 40, "done"),
      workout("2026-11-25", "tempo", 50, "skipped"),
      workout("2026-11-27", "long", 90, null),
      workout("2026-11-29", "easy", 30, null),
      workout("2026-11-30", "easy", 30, null),
    ];
    const [week, next] = weeklySummary(list, ["2026-11-23", "2026-11-30"], "2026-11-28");
    expect(week).toEqual({
      weekOf: "2026-11-23",
      plannedMinutes: 210,
      doneMinutes: 40,
      done: 1,
      skipped: 1,
      unmarked: 1,
      hardShare: 50 / 210,
    });
    expect(next).toMatchObject({ plannedMinutes: 30, unmarked: 0 });
    expect(consistency([week!, next!])).toBeCloseTo(1 / 3);
    expect(consistency([next!])).toBeNull();
  });
});
