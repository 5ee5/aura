// Turns the stored profile into what the coach reads: units named, no ids.
import { WEEKDAYS } from "../../lib/profile-options";
import { formatDuration } from "../../lib/units";
import type { getProfile } from "../profile/data";

type Profile = Awaited<ReturnType<typeof getProfile>>;

const km = (metres: number | null) => (metres ? metres / 1000 : undefined);
const time = (seconds: number | null) => (seconds ? formatDuration(seconds) : undefined);

/** The athlete's name is left out: coaching does not need it. */
export function describeProfile(profile: Profile): string {
  if (!profile) return "The athlete has not saved a profile yet.";
  const { athlete, week, goals, bests, races, injuries } = profile;

  return JSON.stringify({
    note: "Typed in by the athlete. Times are m:ss or h:mm:ss. An empty list means nothing entered.",
    trainingPreferences: athlete.trainingPreferences,
    preferredWorkoutTypes: athlete.preferredWorkoutTypes,
    weeklyAvailability: [...week]
      .sort((a, b) => a.weekday - b.weekday)
      .map((day) => ({
        day: WEEKDAYS[day.weekday - 1],
        maxMinutes: day.maxMinutes,
        restDay: day.maxMinutes === 0 || undefined,
        notes: day.notes ?? undefined,
      })),
    goals: goals.map((goal) => ({
      description: goal.description,
      status: goal.status,
      race: goal.raceName ?? undefined,
      raceDate: goal.raceDate ?? undefined,
      distanceKm: km(goal.distanceMetres),
      targetTime: time(goal.targetSeconds),
    })),
    personalBests: bests.map((best) => ({
      distanceKm: km(best.distanceMetres),
      time: time(best.timeSeconds),
      date: best.achievedOn ?? undefined,
      source: best.source,
    })),
    races: races.map((race) => ({
      name: race.name,
      date: race.raceDate,
      distanceKm: km(race.distanceMetres),
      elevationGainMetres: race.elevationGainMetres ?? undefined,
      surface: race.surface,
      time: time(race.timeSeconds) ?? "did not finish",
      notes: race.notes ?? undefined,
      source: race.source,
    })),
    injuries: injuries.map((injury) => ({
      bodyArea: injury.bodyArea,
      description: injury.description,
      started: injury.startedOn,
      resolved: injury.resolvedOn ?? "not resolved: current",
    })),
  });
}
