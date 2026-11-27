import { describe, expect, it } from "vitest";
import { describeProfile } from "./profile-summary";

describe("describeProfile", () => {
  it("says when there is no profile", () => {
    expect(describeProfile(undefined)).toContain("not saved a profile");
  });

  it("names units and days, marks current injuries, and leaves out ids and the name", () => {
    const row = { id: 77, athleteId: 77, createdAt: new Date(), updatedAt: new Date() };
    const text = describeProfile({
      athlete: { ...row, name: "Private Name", trainingPreferences: null, preferredWorkoutTypes: ["Trail"] },
      week: [{ ...row, weekday: 2, maxMinutes: 0, notes: null }],
      goals: [],
      bests: [{ ...row, distanceMetres: 21097, timeSeconds: 5525, achievedOn: null, source: "reported" }],
      races: [],
      injuries: [{ ...row, bodyArea: "Calf", description: "Sore", startedOn: "2026-11-01", resolvedOn: null }],
    });
    expect(JSON.parse(text)).toMatchObject({
      weeklyAvailability: [{ day: "Tuesday", maxMinutes: 0, restDay: true }],
      personalBests: [{ distanceKm: 21.097, time: "1:32:05", source: "reported" }],
      injuries: [{ resolved: "not resolved: current" }],
    });
    expect(text).not.toMatch(/Private Name|77|athleteId/);
  });
});
