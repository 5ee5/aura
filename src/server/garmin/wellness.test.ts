// Made-up numbers only; nothing calls Garmin.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recoverySummary, type WellnessDay } from "../../lib/recovery";
import { dailyWellness } from "../db/schema";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import type { GarminClient } from "./client";
import { BACKFILL_DAYS, mergeWellness, REFRESH_DAYS, syncWellness } from "./wellness";
import { wellnessBetween } from "./wellness-store";

const sleep = (calendarDate: string, hours: number, extra: object = {}) => ({
  calendarDate,
  sleepTimeSeconds: hours * 3600,
  deepSleepSeconds: 3600,
  lightSleepSeconds: hours * 3600 - 5400,
  remSleepSeconds: 1800,
  awakeSleepSeconds: 600,
  avgHeartRate: 52,
  sleepScores: { overall: { value: 80 } },
  sleepScoreFeedback: "SOME_ADVICE_TEXT",
  ...extra,
});
const hrv = (calendarDate: string, lastNightAvg: number) => ({
  calendarDate,
  lastNightAvg,
  weeklyAvg: 60,
  baseline: { balancedLow: 55, balancedUpper: 70 },
  status: "BALANCED",
  feedbackPhrase: "HRV_SOME_PHRASE",
});
const day = (calendarDate: string, restingValue: number) => ({
  calendarDate,
  heartRate: { restingValue },
  stress: { avgLevel: 30 },
  bodyBattery: { maxValue: 90, minValue: 20 },
});

describe("mergeWellness", () => {
  it("joins the three answers by date and keeps no advice text", () => {
    const rows = mergeWellness([sleep("2026-11-27", 7.5)], { hrvSummaries: [hrv("2026-11-27", 62), hrv("2026-11-26", 58)] }, { data: [day("2026-11-27", 48)] });
    expect(rows.map((r) => r.on)).toEqual(["2026-11-26", "2026-11-27"]);
    expect(rows[1]).toMatchObject({
      sleepSeconds: 27000,
      sleepScore: 80,
      sleepHeartRate: 52,
      hrvLastNight: 62,
      hrvBalancedLow: 55,
      hrvBalancedHigh: 70,
      hrvStatus: "BALANCED",
      restingHeartRate: 48,
      stressAverage: 30,
      bodyBatteryHigh: 90,
      bodyBatteryLow: 20,
    });
    expect(rows[0]).toMatchObject({ hrvLastNight: 58, sleepSeconds: null, restingHeartRate: null });
    expect(JSON.stringify(rows)).not.toMatch(/ADVICE|PHRASE/);
  });

  it("drops values outside plausible ranges rather than trusting them", () => {
    const [row] = mergeWellness(
      [sleep("2026-11-27", 7, { avgHeartRate: 400, sleepScores: { overall: { value: 140 } } })],
      { hrvSummaries: [{ ...hrv("2026-11-27", -5), status: "<b>x</b>" }] },
      { data: [day("2026-11-27", 0)] },
    );
    expect(row).toMatchObject({ sleepSeconds: 25200, sleepHeartRate: null, sleepScore: null, hrvLastNight: null, hrvStatus: null, restingHeartRate: null });
  });

  it("treats a missing list as an error, not as no data", () => {
    expect(() => mergeWellness([], { nope: 1 }, { data: [] })).toThrow("HRV list");
    expect(() => mergeWellness([], { hrvSummaries: [] }, {})).toThrow("daily summary list");
  });
});

describe("recoverySummary", () => {
  const row = (on: string, hours: number | null, hrvMs: number | null, rhr: number | null): WellnessDay => ({
    on,
    sleepSeconds: hours === null ? null : hours * 3600,
    sleepScore: null,
    hrvLastNight: hrvMs,
    hrvBalancedLow: 50,
    hrvBalancedHigh: 70,
    hrvStatus: "BALANCED",
    restingHeartRate: rhr,
    stressAverage: null,
    bodyBatteryHigh: null,
  });

  it("averages only days with a value, and leaves today's daytime numbers out", () => {
    const days = [
      row("2026-11-22", 7, 60, 50),
      row("2026-11-23", 8, null, 50),
      row("2026-11-24", null, 60, 52),
      row("2026-11-25", 7, 70, 52),
      row("2026-11-26", 8, 60, 50),
      row("2026-11-27", 7, 60, 50),
      row("2026-11-28", 6, 50, 70),
    ];
    const s = recoverySummary(days, "2026-11-28");
    expect(s.lastNight?.on).toBe("2026-11-28");
    expect(s.sleepHours7).toEqual({ value: 7.2, days: 6 });
    expect(s.hrv7).toEqual({ value: 60, days: 6 });
    // Today's partial 70 is not counted: 50,50,52,52,50,50.
    expect(s.restingHeartRate7).toEqual({ value: 50.7, days: 6 });
    expect(s.hrv28.value).toBeNull();
  });
});

describe("syncWellness", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  beforeAll(resetTestDatabase);
  afterAll(() => pool.end());

  function fakeClient(requests: string[]): GarminClient {
    return {
      async get(path) {
        requests.push(path.split("?")[0]!.replace(/\d{4}-\d\d-\d\d/g, "D"));
        if (path.startsWith("/sleep-service")) {
          const start = new URL(path, "https://x").searchParams.get("startDate")!;
          return [sleep(start, 7)];
        }
        if (path.startsWith("/hrv-service")) return { hrvSummaries: [hrv("2026-11-27", 60)] };
        if (path.startsWith("/usersummary-service")) return { data: [day("2026-11-27", 49), day("2026-11-28", 51)] };
        throw new Error(`unexpected path ${path}`);
      },
    };
  }

  it("backfills about three months first, in 28-day sleep requests, then refreshes two weeks", async () => {
    const first: string[] = [];
    await syncWellness(db, fakeClient(first), "2026-11-28");
    expect(first.filter((p) => p.startsWith("/sleep")).length).toBe(Math.ceil((BACKFILL_DAYS + 1) / 28));
    const stored = await wellnessBetween(db, "2026-01-01", "2026-12-31");
    expect(stored.find((d) => d.on === "2026-11-27")).toMatchObject({ hrvLastNight: 60, restingHeartRate: 49 });

    const again: string[] = [];
    await db.insert(dailyWellness).values({ on: "2026-11-20", restingHeartRate: 99 }).onConflictDoUpdate({ target: dailyWellness.on, set: { restingHeartRate: 99 } });
    await syncWellness(db, fakeClient(again), "2026-11-28");
    expect(again.filter((p) => p.startsWith("/sleep")).length).toBe(Math.ceil((REFRESH_DAYS + 1) / 28));
    // Inside the refreshed range, a date Garmin no longer returns is gone.
    expect((await wellnessBetween(db, "2026-11-20", "2026-11-20"))[0]?.restingHeartRate ?? null).not.toBe(99);
  });

  it("changes nothing when an answer is odd", async () => {
    const before = await db.$count(dailyWellness);
    const broken: GarminClient = { get: async (path) => (path.startsWith("/hrv-service") ? { error: "x" } : path.startsWith("/sleep") ? [] : { data: [] }) };
    await expect(syncWellness(db, broken, "2026-11-28")).rejects.toThrow("HRV list");
    expect(await db.$count(dailyWellness)).toBe(before);
  });
});
