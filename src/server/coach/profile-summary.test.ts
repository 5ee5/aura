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
      races: [{ ...row, name: "Half", raceDate: "2026-04-01", distanceMetres: 21097, elevationGainMetres: null, surface: "road", timeSeconds: 5525, source: "reported", notes: null }],
      injuries: [{ ...row, bodyArea: "Calf", description: "Sore", startedOn: "2026-11-01", resolvedOn: null }],
      garmin: { snapshot: undefined, bests: [] },
    });
    expect(JSON.parse(text)).toMatchObject({
      garmin: "not connected",
      weeklyAvailability: [{ day: "Tuesday", maxMinutes: 0, restDay: true }],
      races: [{ distanceKm: 21.097, time: "1:32:05" }],
      injuries: [{ resolved: "not resolved: current" }],
    });
    expect(text).not.toMatch(/Private Name|77|athleteId/);
  });

  it("adds Garmin's numbers, labelled as read from the watch, without activity ids", () => {
    const row = { id: 5, athleteId: 5, createdAt: new Date(), updatedAt: new Date() };
    const text = describeProfile({
      athlete: { ...row, name: "X", trainingPreferences: null, preferredWorkoutTypes: [] },
      week: [],
      goals: [],
      races: [],
      injuries: [],
      garmin: {
        snapshot: {
          id: 1,
          athleteId: 5,
          maxHeartRate: 190,
          restingHeartRate: 48,
          lactateThresholdHeartRate: null,
          heartRateZones: [95, 114, 133, 152, 171],
          vo2Max: 52.3,
          vo2MaxOn: "2026-11-20",
          runsRead: 600,
          syncedAt: new Date("2026-11-28T09:00:00Z"),
        },
        bests: [
          { ...row, distanceMetres: 5000, timeSeconds: 1234, achievedOn: "2025-06-01", source: "measured", garminActivityId: 987654321 },
        ],
      },
    });
    expect(JSON.parse(text).garmin).toMatchObject({
      syncedOn: "2026-11-28",
      bestEfforts: [{ distanceKm: 5, time: "20:34", date: "2025-06-01" }],
      maxHeartRate: 190,
      vo2Max: 52.3,
    });
    expect(text).not.toContain("987654321");
  });
});
