// Recovery numbers as Aura shows and tells them. Pure; used by the page and the coach.

export interface WellnessDay {
  on: string;
  sleepSeconds: number | null;
  sleepScore: number | null;
  hrvLastNight: number | null;
  hrvBalancedLow: number | null;
  hrvBalancedHigh: number | null;
  hrvStatus: string | null;
  restingHeartRate: number | null;
  stressAverage: number | null;
  bodyBatteryHigh: number | null;
}

export interface Average {
  value: number | null;
  /** How many days had a value. */
  days: number;
}

/**
 * The mean over days that have a value, one decimal, or null when fewer than
 * `minimum` do: a gap is never counted as zero.
 */
export function average(days: WellnessDay[], pick: (d: WellnessDay) => number | null, minimum: number): Average {
  const values = days.map(pick).filter((v): v is number => v !== null);
  if (values.length < minimum) return { value: null, days: values.length };
  return { value: Math.round((values.reduce((n, v) => n + v, 0) / values.length) * 10) / 10, days: values.length };
}

/**
 * Today's row holds last night's sleep and HRV, which are complete, but its
 * resting heart rate, stress and Body Battery are only the day so far. So
 * nightly averages include today and daytime ones stop at yesterday.
 */
export function recoverySummary(days: WellnessDay[], today: string) {
  const sorted = [...days].filter((d) => d.on <= today).sort((a, b) => a.on.localeCompare(b.on));
  const lastDays = (n: number, includeToday: boolean) => {
    const pool = includeToday ? sorted : sorted.filter((d) => d.on < today);
    return pool.slice(-n);
  };
  const lastNight = sorted.findLast((d) => d.sleepSeconds !== null || d.hrvLastNight !== null);
  return {
    lastNight,
    sleepHours7: average(lastDays(7, true), (d) => (d.sleepSeconds === null ? null : d.sleepSeconds / 3600), 4),
    sleepHours28: average(lastDays(28, true), (d) => (d.sleepSeconds === null ? null : d.sleepSeconds / 3600), 14),
    hrv7: average(lastDays(7, true), (d) => d.hrvLastNight, 4),
    hrv28: average(lastDays(28, true), (d) => d.hrvLastNight, 14),
    restingHeartRate7: average(lastDays(7, false), (d) => d.restingHeartRate, 4),
    restingHeartRate28: average(lastDays(28, false), (d) => d.restingHeartRate, 14),
  };
}

/** "7:32" from seconds. */
export const sleepTime = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}`;

/** BALANCED to "Balanced". */
export const hrvWord = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
