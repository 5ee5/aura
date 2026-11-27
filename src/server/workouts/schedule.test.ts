import { describe, expect, it } from "vitest";
import type { WorkoutType } from "../../lib/workout";
import { type Planned, scheduleProblem } from "./schedule";

const p = (date: string, type: WorkoutType = "easy", minutes = 40, id?: number): Planned => ({ id, date, type, minutes });
const none = new Map<number, number>();

describe("scheduleProblem", () => {
  it("allows a sensible week", () => {
    const week = [p("2026-11-30"), p("2026-12-01", "tempo", 50), p("2026-12-03"), p("2026-12-04", "threshold", 55), p("2026-12-06", "long", 90)];
    expect(scheduleProblem(week, [], none)).toBeUndefined();
  });

  it("refuses hard sessions on consecutive days, including against what is planned", () => {
    expect(scheduleProblem([p("2026-12-02", "vo2max")], [p("2026-12-01", "tempo")], none)).toMatch(/consecutive days/);
    expect(scheduleProblem([p("2026-12-01", "hills"), p("2026-12-02", "tempo")], [], none)).toMatch(/consecutive/);
    // A hard session followed by an easy one is fine.
    expect(scheduleProblem([p("2026-12-02", "easy")], [p("2026-12-01", "tempo")], none)).toBeUndefined();
  });

  it("caps hard sessions in a week", () => {
    const four = ["2026-11-30", "2026-12-02", "2026-12-04", "2026-12-06"].map((d) => p(d, "tempo"));
    expect(scheduleProblem(four, [], none)).toMatch(/4 hard sessions/);
  });

  it("limits growth over the week before, once there is a real baseline", () => {
    const last = [p("2026-11-23", "easy", 100), p("2026-11-26", "easy", 100)];
    // 200 the week before: +10% is 220, +30 minutes is 230, and the larger counts.
    expect(scheduleProblem([p("2026-11-30", "long", 240)], last, none)).toMatch(/at most 230/);
    expect(scheduleProblem([p("2026-11-30", "long", 230)], last, none)).toBeUndefined();
    // A light week (under 90 minutes) is no baseline.
    expect(scheduleProblem([p("2026-11-30", "long", 200)], [p("2026-11-23", "easy", 60)], none)).toBeUndefined();
  });

  it("adds up a day against its available minutes, and ignores the workout being moved", () => {
    const tuesday = new Map([[2, 60]]);
    expect(scheduleProblem([p("2026-12-01", "easy", 30)], [p("2026-12-01", "easy", 40, 7)], tuesday)).toMatch(/about 70 minutes/);
    expect(scheduleProblem([p("2026-12-01", "easy", 50, 7)], [p("2026-12-01", "easy", 40, 7)], tuesday)).toBeUndefined();
  });
});
