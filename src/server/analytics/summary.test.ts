import { describe, expect, it } from "vitest";
import type { Workout } from "../../lib/workout";
import { consistency, weeklySummary } from "./summary";

const workout = (scheduledOn: string, type: Workout["type"], minutes: number, outcome: Workout["outcome"], id = 1): Workout => ({
  ...base(scheduledOn, type, minutes, outcome),
  id,
});

const base = (scheduledOn: string, type: Workout["type"], minutes: number, outcome: Workout["outcome"]): Workout => ({
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
      ran: { runs: 0, km: 0, minutes: 0, load: 0, runsWithLoad: 0 },
    });
    expect(next).toMatchObject({ plannedMinutes: 30, unmarked: 0 });
    expect(consistency([week!, next!])).toBeCloseTo(1 / 3);
    expect(consistency([next!])).toBeNull();
  });

  it("counts a workout matched to a Garmin run as done and adds up what was run", () => {
    const list = [workout("2026-11-23", "easy", 40, null, 1), workout("2026-11-24", "easy", 40, null, 2)];
    const run = { id: 9, on: "2026-11-23", type: "running", startLocal: "2026-11-23 07:00:00", distanceMetres: 8250, durationSeconds: 2700, averageHeartRate: 140, trainingLoad: 60 };
    const extra = { ...run, id: 10, on: "2026-11-26", startLocal: "2026-11-26 07:00:00", distanceMetres: 5000, durationSeconds: 1800, trainingLoad: null };
    const matches = new Map([[1, { outcome: "done" as const, by: "garmin" as const, run }]]);
    const [week] = weeklySummary(list, ["2026-11-23"], "2026-11-28", matches, [run, extra]);
    expect(week).toMatchObject({ done: 1, doneMinutes: 40, unmarked: 1 });
    expect(week!.ran).toEqual({ runs: 2, km: 13.3, minutes: 75, load: 60, runsWithLoad: 1 });
  });
});
