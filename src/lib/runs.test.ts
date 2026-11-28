import { describe, expect, it } from "vitest";
import { describeRun, matchRuns, type Run } from "./runs";

const run = (id: number, on: string, minutes: number, start = "07:00:00"): Run => ({
  id,
  on,
  type: "running",
  startLocal: `${on} ${start}`,
  distanceMetres: minutes * 170,
  durationSeconds: minutes * 60,
  averageHeartRate: 145,
  trainingLoad: null,
});
const planned = (id: number, scheduledOn: string, minutes: number, outcome: "done" | "skipped" | null = null) => ({
  id,
  scheduledOn,
  minutes,
  outcome,
});

describe("matchRuns", () => {
  it("marks a workout done by a run that day, longest with longest", () => {
    const { matches, extras } = matchRuns(
      [planned(1, "2026-11-24", 30), planned(2, "2026-11-24", 70), planned(3, "2026-11-25", 40)],
      [run(10, "2026-11-24", 25, "18:00:00"), run(11, "2026-11-24", 80), run(12, "2026-11-24", 10, "06:00:00")],
    );
    expect(matches.get(2)).toMatchObject({ outcome: "done", by: "garmin", run: { id: 11 } });
    expect(matches.get(1)).toMatchObject({ outcome: "done", by: "garmin", run: { id: 10 } });
    expect(matches.get(3)).toEqual({ outcome: null, by: null });
    expect(extras.get("2026-11-24")?.map((r) => r.id)).toEqual([12]);
  });

  it("lets the athlete's mark win and gives a skipped workout no run", () => {
    const { matches, extras } = matchRuns(
      [planned(1, "2026-11-24", 40, "skipped"), planned(2, "2026-11-25", 40, "done")],
      [run(10, "2026-11-24", 40), run(11, "2026-11-25", 40)],
    );
    expect(matches.get(1)).toEqual({ outcome: "skipped", by: "athlete" });
    expect(matches.get(2)).toMatchObject({ outcome: "done", by: "athlete", run: { id: 11 } });
    expect(extras.get("2026-11-24")?.map((r) => r.id)).toEqual([10]);
  });

  it("leaves runs on days with nothing planned as extras", () => {
    const { matches, extras } = matchRuns([], [run(10, "2026-11-24", 40)]);
    expect(matches.size).toBe(0);
    expect(extras.get("2026-11-24")).toHaveLength(1);
  });
});

it("describes a run briefly", () => {
  expect(describeRun(run(1, "2026-11-24", 50))).toBe("8.5 km, 50 min, 145 bpm");
  expect(describeRun({ ...run(1, "2026-11-24", 50), distanceMetres: null, averageHeartRate: null })).toBe("50 min");
});
