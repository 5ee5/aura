import { describe, expect, it } from "vitest";
import { formatDuration, formatKilometres, parseDuration, parseKilometres } from "../../lib/units";
import { goalSchema, injurySchema, parseWeek, parseWith } from "./validation";

describe("units", () => {
  it.each([
    ["19:45", 1185, "19:45"],
    ["1:32:05", 5525, "1:32:05"],
    ["75:00", 4500, "1:15:00"],
    ["0:59.5", 59.5, "0:59.50"],
    ["26:03:10", 93790, "26:03:10"],
  ])("reads %s and writes it back", (typed, seconds, shown) => {
    expect(parseDuration(typed)).toBe(seconds);
    expect(formatDuration(seconds)).toBe(shown);
    expect(parseDuration(shown)).toBe(seconds);
  });

  it.each(["45", "1:60", "1:75:00", "0:00", "fast", ""])("rejects the time %j", (typed) => {
    expect(parseDuration(typed)).toBeNull();
  });

  it("converts kilometres without losing metres", () => {
    expect(parseKilometres("42,195")).toBe(42195);
    expect(formatKilometres(21097)).toBe("21.097");
    for (const bad of ["0", "-5", "10km", "2000"]) expect(parseKilometres(bad)).toBeNull();
  });
});

describe("profile forms", () => {
  const injury = { bodyArea: "Knee", description: "Sore", startedOn: "2026-03-01" };

  it("turns blank optional fields into null", () => {
    const goal = { description: "Run more", raceName: "", raceDate: "", distanceMetres: "" };
    expect(parseWith(goalSchema, { ...goal, targetSeconds: " ", status: "active" }).data).toEqual({
      description: "Run more",
      raceName: null,
      raceDate: null,
      distanceMetres: null,
      targetSeconds: null,
      status: "active",
    });
  });

  it("names the field that is wrong", () => {
    expect(parseWith(injurySchema, { ...injury, resolvedOn: "2026-02-01" }).error).toBe(
      "Resolved: Cannot be before the start date.",
    );
    expect(parseWith(injurySchema, { ...injury, startedOn: "2026-02-30" }).error).toMatch(
      /^Started:/,
    );
  });

  it("keeps rest days and skips blank days", () => {
    expect(parseWeek({ minutes_1: "0", minutes_3: "60", notes_3: "track" }).data).toEqual([
      { weekday: 1, maxMinutes: 0, notes: null },
      { weekday: 3, maxMinutes: 60, notes: "track" },
    ]);
    expect(parseWeek({ notes_2: "evening" }).error).toMatch(/^Tuesday:/);
    expect(parseWeek({ minutes_7: "1.5" }).error).toMatch(/^Sunday:/);
  });
});
