// Recovery data from Garmin: sleep, HRV and daily summaries, merged into one
// row per date. Relative imports only: run in tests too. Garmin's advice and
// insight texts are never copied, only numbers and the HRV status word.
import { and, between } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { addDays, daysBetween } from "../../lib/dates";
import { dailyWellness } from "../db/schema";
import { GarminError, type GarminClient } from "./client";

export type WellnessRow = Omit<typeof dailyWellness.$inferInsert, "updatedAt">;

type Json = Record<string, unknown>;
const record = (value: unknown): Json | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value);

/** A whole number within [low, high], else null: a value outside is not trusted. */
const within = (value: unknown, low: number, high: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high ? Math.round(value) : null;

const odd = (what: string) => new GarminError("unavailable", `Garmin sent an unexpected ${what}. Recovery data was not changed.`);

const empty = (on: string): WellnessRow => ({
  on,
  sleepSeconds: null,
  deepSleepSeconds: null,
  lightSleepSeconds: null,
  remSleepSeconds: null,
  awakeSeconds: null,
  sleepScore: null,
  sleepHeartRate: null,
  hrvLastNight: null,
  hrvWeeklyAverage: null,
  hrvBalancedLow: null,
  hrvBalancedHigh: null,
  hrvStatus: null,
  restingHeartRate: null,
  stressAverage: null,
  bodyBatteryHigh: null,
  bodyBatteryLow: null,
});

const DAY = 86_400;

/** Merges the three responses by date; a non-list answer is an error, not an empty one. */
export function mergeWellness(sleep: unknown[], hrv: unknown, daily: unknown): WellnessRow[] {
  const rows = new Map<string, WellnessRow>();
  const row = (on: string) => rows.get(on) ?? rows.set(on, empty(on)).get(on)!;

  for (const item of sleep.map(record)) {
    if (!item || !isDay(item.calendarDate)) continue;
    const seconds = within(item.sleepTimeSeconds, 1, DAY);
    if (seconds === null) continue;
    Object.assign(row(item.calendarDate), {
      sleepSeconds: seconds,
      deepSleepSeconds: within(item.deepSleepSeconds, 0, DAY),
      lightSleepSeconds: within(item.lightSleepSeconds, 0, DAY),
      remSleepSeconds: within(item.remSleepSeconds, 0, DAY),
      awakeSeconds: within(item.awakeSleepSeconds, 0, DAY),
      sleepScore: within(record(record(item.sleepScores)?.overall)?.value, 0, 100),
      sleepHeartRate: within(item.avgHeartRate, 25, 200),
    });
  }

  const summaries = record(hrv)?.hrvSummaries;
  if (!Array.isArray(summaries)) throw odd("HRV list");
  for (const item of summaries.map(record)) {
    if (!item || !isDay(item.calendarDate)) continue;
    const baseline = record(item.baseline);
    Object.assign(row(item.calendarDate), {
      hrvLastNight: within(item.lastNightAvg, 1, 300),
      hrvWeeklyAverage: within(item.weeklyAvg, 1, 300),
      hrvBalancedLow: within(baseline?.balancedLow, 1, 300),
      hrvBalancedHigh: within(baseline?.balancedUpper, 1, 300),
      hrvStatus: typeof item.status === "string" && /^[A-Z_]{1,20}$/.test(item.status) ? item.status : null,
    });
  }

  const days = record(daily)?.data;
  if (!Array.isArray(days)) throw odd("daily summary list");
  for (const item of days.map(record)) {
    if (!item || !isDay(item.calendarDate)) continue;
    const battery = record(item.bodyBattery);
    Object.assign(row(item.calendarDate), {
      restingHeartRate: within(record(item.heartRate)?.restingValue, 25, 150),
      stressAverage: within(record(item.stress)?.avgLevel, 0, 100),
      bodyBatteryHigh: within(battery?.maxValue, 0, 100),
      bodyBatteryLow: within(battery?.minValue, 0, 100),
    });
  }
  return [...rows.values()].sort((a, b) => a.on.localeCompare(b.on));
}

/** Sleep is served at most 28 days per request. */
const SLEEP_SPAN = 28;

export async function fetchWellness(client: GarminClient, from: string, to: string): Promise<WellnessRow[]> {
  const sleep: unknown[] = [];
  for (let start = from; start <= to; start = addDays(start, SLEEP_SPAN)) {
    const end = addDays(start, SLEEP_SPAN - 1) < to ? addDays(start, SLEEP_SPAN - 1) : to;
    const page = await client.get(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${start}&endDate=${end}`);
    if (!Array.isArray(page)) throw odd("sleep list");
    sleep.push(...page);
  }
  const hrv = await client.get(`/hrv-service/hrv/daily/${from}/${to}`);
  const daily = await client.get(`/usersummary-service/v2/dailysummaries?startDate=${from}&endDate=${to}`);
  return mergeWellness(sleep, hrv, daily);
}

/** First sync: about three months. Later: the last two weeks, since nights arrive and change late. */
export const BACKFILL_DAYS = 90;
export const REFRESH_DAYS = 14;

/** Fetches, then replaces exactly the fetched dates in one transaction. */
export async function syncWellness(db: NodePgDatabase, client: GarminClient, today: string): Promise<number> {
  const stored = await db.$count(dailyWellness);
  const from = addDays(today, -(stored ? REFRESH_DAYS : BACKFILL_DAYS));
  const rows = await fetchWellness(client, from, today);
  if (rows.some((r) => daysBetween(from, r.on) < 0 || r.on > today)) throw odd("date range");
  await db.transaction(async (tx) => {
    await tx.delete(dailyWellness).where(and(between(dailyWellness.on, from, today)));
    if (rows.length) await tx.insert(dailyWellness).values(rows);
  });
  return rows.length;
}
