// Pure functions from Garmin's JSON to Aura's numbers. Garmin's shapes are
// read defensively: a missing or odd field is skipped, never trusted.

/** Distances Garmin records a fastest split for, in metres, that Aura keeps as bests. */
export const GARMIN_BEST_DISTANCES = [1000, 1609, 5000, 10000, 21098, 42195] as const;

/**
 * Outdoor runs only: treadmill and indoor distances are estimated by the watch,
 * so their splits are not real bests.
 */
const OUTDOOR_RUNS = new Set(["running", "trail_running", "track_running", "street_running"]);

/** Faster than 2:30 per km is a GPS glitch, not a run. */
const FASTEST_SECONDS_PER_METRE = 0.15;

export interface GarminBest {
  distanceMetres: number;
  timeSeconds: number;
  achievedOn: string | null;
  activityId: number;
}

type Activity = Record<string, unknown>;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

export function isOutdoorRun(activity: Activity): boolean {
  const type = record(activity.activityType)?.typeKey;
  return typeof type === "string" && OUTDOOR_RUNS.has(type);
}

/** The date part of Garmin's "YYYY-MM-DD HH:MM:SS" local start time. */
function localDate(activity: Activity): string | null {
  const start = activity.startTimeLocal;
  return typeof start === "string" && /^\d{4}-\d\d-\d\d/.test(start) ? start.slice(0, 10) : null;
}

/** The fastest time at each distance across all outdoor runs. Ties keep the earlier run. */
export function bestsFromActivities(activities: unknown[]): GarminBest[] {
  const bests = new Map<number, GarminBest>();
  for (const item of activities) {
    const activity = record(item);
    if (!activity || !isOutdoorRun(activity)) continue;
    const activityId = positive(activity.activityId);
    if (!activityId) continue;
    for (const distance of GARMIN_BEST_DISTANCES) {
      const time = positive(activity[`fastestSplit_${distance}`]);
      if (!time || time < distance * FASTEST_SECONDS_PER_METRE) continue;
      const seconds = Math.round(time * 100) / 100;
      const current = bests.get(distance);
      const achievedOn = localDate(activity);
      const earlier = current && achievedOn !== null && current.achievedOn !== null && achievedOn < current.achievedOn;
      if (!current || seconds < current.timeSeconds || (seconds === current.timeSeconds && earlier))
        bests.set(distance, { distanceMetres: distance, timeSeconds: seconds, achievedOn, activityId });
    }
  }
  return [...bests.values()].sort((a, b) => a.distanceMetres - b.distanceMetres);
}

export interface HeartRate {
  maxHeartRate: number | null;
  restingHeartRate: number | null;
  lactateThresholdHeartRate: number | null;
  heartRateZones: number[] | null;
}

const bpm = (value: unknown) => {
  const n = positive(value);
  return n && n >= 25 && n <= 250 ? Math.round(n) : null;
};

/** Running zones if Garmin has them, else the default set. */
export function heartRateFromZones(response: unknown): HeartRate {
  const sets = Array.isArray(response) ? response.map(record).filter((x) => x !== undefined) : [];
  const zones = sets.find((s) => s.sport === "RUNNING") ?? sets.find((s) => s.sport === "DEFAULT") ?? sets[0];
  if (!zones)
    return { maxHeartRate: null, restingHeartRate: null, lactateThresholdHeartRate: null, heartRateZones: null };
  const floors = [1, 2, 3, 4, 5].map((n) => bpm(zones[`zone${n}Floor`]));
  const complete = floors.every((f, i) => f !== null && (i === 0 || f > floors[i - 1]!));
  return {
    maxHeartRate: bpm(zones.maxHeartRateUsed),
    restingHeartRate: bpm(zones.restingHeartRateUsed),
    lactateThresholdHeartRate: bpm(zones.lactateThresholdHeartRateUsed),
    heartRateZones: complete ? (floors as number[]) : null,
  };
}

/** The newest running VO2 max in a maxmet range response. */
export function latestVo2Max(response: unknown): { vo2Max: number; on: string } | null {
  let latest: { vo2Max: number; on: string } | null = null;
  for (const item of Array.isArray(response) ? response : []) {
    const generic = record(record(item)?.generic);
    const value = positive(generic?.vo2MaxPreciseValue) ?? positive(generic?.vo2MaxValue);
    const on = generic?.calendarDate;
    if (!value || value > 99 || typeof on !== "string" || !/^\d{4}-\d\d-\d\d$/.test(on)) continue;
    if (!latest || on > latest.on) latest = { vo2Max: Math.round(value * 10) / 10, on };
  }
  return latest;
}
