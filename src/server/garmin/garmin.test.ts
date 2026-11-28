// Garmin import. All data here is made up; nothing calls Garmin.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activities, athletes, garminSnapshots, personalBests } from "../db/schema";
import { resetTestDatabase, testDatabaseUrl } from "../db/test-database";
import { createGarminClient, GarminError, type GarminClient } from "./client";
import { activityFromGarmin, bestsFromActivities, heartRateFromZones, isRunType, latestVo2Max } from "./extract";
import { syncGarmin } from "./sync";

const run = (id: number, date: string, splits: Record<number, number>, type = "running") => ({
  activityId: id,
  startTimeLocal: `${date} 07:30:00`,
  activityType: { typeKey: type },
  ...Object.fromEntries(Object.entries(splits).map(([d, s]) => [`fastestSplit_${d}`, s])),
});

describe("bestsFromActivities", () => {
  it("keeps the fastest outdoor time per distance, with its date and run", () => {
    const bests = bestsFromActivities([
      run(1, "2025-03-01", { 1000: 250, 5000: 1400 }),
      run(2, "2025-06-01", { 1000: 240.456, 5000: 1450, 10000: 3000 }),
      run(3, "2025-07-01", { 5000: 1300 }, "trail_running"),
    ]);
    expect(bests).toEqual([
      { distanceMetres: 1000, timeSeconds: 240.46, achievedOn: "2025-06-01", activityId: 2 },
      { distanceMetres: 5000, timeSeconds: 1300, achievedOn: "2025-07-01", activityId: 3 },
      { distanceMetres: 10000, timeSeconds: 3000, achievedOn: "2025-06-01", activityId: 2 },
    ]);
  });

  it("ignores treadmill and indoor runs, other sports, glitches and junk", () => {
    const bests = bestsFromActivities([
      run(1, "2025-01-01", { 5000: 1000 }, "treadmill_running"),
      run(2, "2025-01-01", { 5000: 1000 }, "indoor_running"),
      run(3, "2025-01-01", { 5000: 500 }, "cycling"),
      run(4, "2025-01-01", { 5000: 700 }), // 2:20 per km: GPS glitch
      run(5, "2025-01-01", { 5000: -3 }),
      { activityType: { typeKey: "running" }, fastestSplit_5000: 1500 }, // no id
      null,
      "nonsense",
    ]);
    expect(bests).toEqual([]);
  });

  it("keeps the earlier run on a tie", () => {
    const [best] = bestsFromActivities([run(2, "2025-06-01", { 1000: 240 }), run(1, "2025-02-01", { 1000: 240 })]);
    expect(best).toMatchObject({ activityId: 1, achievedOn: "2025-02-01" });
  });
});

describe("activityFromGarmin", () => {
  const full = {
    activityId: 42,
    activityName: "Morning run",
    activityType: { typeKey: "treadmill_running" },
    startTimeLocal: "2025-05-01 07:30:00",
    distance: 8000.5,
    duration: 2400,
    movingDuration: 2390,
    elevationGain: 0,
    averageHR: 148.4,
    maxHR: 171,
    averageRunningCadenceInStepsPerMinute: 172.5,
    activityTrainingLoad: 61.2,
    aerobicTrainingEffect: 3.1,
    anaerobicTrainingEffect: 0,
    hrTimeInZone_1: 100, hrTimeInZone_2: 900, hrTimeInZone_3: 1200, hrTimeInZone_4: 200, hrTimeInZone_5: 0,
    ownerFullName: "Someone Private",
    ownerProfileImageUrlSmall: "https://example.invalid/me.jpg",
    startLatitude: 56.9,
    startLongitude: 24.1,
  };

  it("keeps the allowed fields and nothing personal or located", () => {
    const row = activityFromGarmin(full)!;
    expect(row).toEqual({
      garminId: 42,
      type: "treadmill_running",
      name: "Morning run",
      startLocal: "2025-05-01 07:30:00",
      on: "2025-05-01",
      distanceMetres: 8000.5,
      durationSeconds: 2400,
      movingSeconds: 2390,
      elevationGainMetres: 0,
      averageHeartRate: 148,
      maxHeartRate: 171,
      averageCadence: 172.5,
      trainingLoad: 61.2,
      aerobicEffect: 3.1,
      anaerobicEffect: 0,
      heartRateZoneSeconds: [100, 900, 1200, 200, 0],
    });
    expect(JSON.stringify(row)).not.toMatch(/Private|jpg|56\.9|24\.1/);
  });

  it("skips what it cannot place in time", () => {
    expect(activityFromGarmin({ ...full, duration: 0 })).toBeUndefined();
    expect(activityFromGarmin({ ...full, startTimeLocal: "yesterday" })).toBeUndefined();
    expect(activityFromGarmin({ ...full, activityId: undefined })).toBeUndefined();
    expect(activityFromGarmin({ ...full, hrTimeInZone_3: null })?.heartRateZoneSeconds).toBeNull();
  });

  it("counts every kind of run as a run", () => {
    expect(["running", "trail_running", "treadmill_running", "indoor_running", "virtual_run"].every(isRunType)).toBe(true);
    expect(["cycling", "walking", "indoor_rowing"].some(isRunType)).toBe(false);
  });
});

describe("heart rate and VO2 max", () => {
  const zones = (sport: string, base: number) => ({
    sport,
    maxHeartRateUsed: 190,
    restingHeartRateUsed: 50,
    lactateThresholdHeartRateUsed: null,
    zone1Floor: base,
    zone2Floor: base + 19,
    zone3Floor: base + 38,
    zone4Floor: base + 57,
    zone5Floor: base + 76,
  });

  it("prefers running zones", () => {
    expect(heartRateFromZones([zones("DEFAULT", 90), zones("RUNNING", 100)])).toEqual({
      maxHeartRate: 190,
      restingHeartRate: 50,
      lactateThresholdHeartRate: null,
      heartRateZones: [100, 119, 138, 157, 176],
    });
  });

  it("drops zones that are not rising and copes with nothing", () => {
    expect(heartRateFromZones([{ ...zones("RUNNING", 100), zone3Floor: 110 }]).heartRateZones).toBeNull();
    expect(heartRateFromZones({})).toMatchObject({ maxHeartRate: null, heartRateZones: null });
  });

  it("takes the newest running VO2 max", () => {
    const day = (calendarDate: string, vo2MaxPreciseValue: number) => ({ generic: { calendarDate, vo2MaxPreciseValue } });
    expect(latestVo2Max([day("2026-11-01", 51.24), day("2026-11-20", 52.36), { generic: null }])).toEqual({
      vo2Max: 52.4,
      on: "2026-11-20",
    });
    expect(latestVo2Max("nope")).toBeNull();
  });
});

describe("Garmin client", () => {
  const jwt = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;

  function fakeFetch(responses: Record<string, () => Response>) {
    const calls: { url: string; auth: string }[] = [];
    const doFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("Authorization") ?? "" });
      const path = new URL(url).pathname;
      return (responses[path] ?? (() => new Response("", { status: 404 })))();
    }) as typeof fetch;
    return { calls, doFetch };
  }

  it("swaps the key for a token once and sends it as a bearer token", async () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 86_400);
    const { calls, doFetch } = fakeFetch({
      "/personalapitoken-service/personal-api/personal-api-key/token": () => new Response(token),
      "/a": () => Response.json([1]),
    });
    const client = createGarminClient({ apiKey: "made-up-key", fetch: doFetch, baseUrl: "https://garmin.invalid" });
    expect(await client.get("/a")).toEqual([1]);
    expect(await client.get("/a")).toEqual([1]);
    expect(calls.map((c) => c.auth)).toEqual(["ApiKey made-up-key", `Bearer ${token}`, `Bearer ${token}`]);
  });

  it("explains a refused key without repeating it", async () => {
    const { doFetch } = fakeFetch({
      "/personalapitoken-service/personal-api/personal-api-key/token": () => new Response("", { status: 401 }),
    });
    const client = createGarminClient({ apiKey: "made-up-key", fetch: doFetch, baseUrl: "https://garmin.invalid" });
    const error = await client.get("/a").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GarminError);
    expect((error as GarminError).kind).toBe("key");
    expect((error as Error).message).not.toContain("made-up-key");
  });
});

describe("syncGarmin", () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  const db = drizzle(pool);
  let athleteId: number;
  beforeAll(async () => {
    await resetTestDatabase();
    const [athlete] = await db.insert(athletes).values({ name: "Test" }).returning({ id: athletes.id });
    athleteId = athlete!.id;
    await db.insert(personalBests).values({ athleteId, distanceMetres: 5000, timeSeconds: 1500, source: "reported" });
  });
  afterAll(() => pool.end());

  /** 150 runs over two pages, then zones and VO2 max. */
  function fakeClient(failOn?: string): GarminClient {
    const list = Array.from({ length: 150 }, (_, i) => ({ ...run(i + 1, "2025-05-01", { 5000: 1400 + i }), duration: 1800 }));
    return {
      async get(path) {
        if (failOn && path.startsWith(failOn)) throw new GarminError("rate", "slow down");
        if (path.startsWith("/activitylist-service")) {
          const start = Number(new URL(path, "https://x").searchParams.get("start"));
          return failOn === "bad-page" && start === 100 ? { error: "odd" } : list.slice(start, start + 100);
        }
        if (path.startsWith("/biometric-service")) return [{ sport: "RUNNING", maxHeartRateUsed: 188 }];
        return [{ generic: { calendarDate: "2026-11-25", vo2MaxValue: 50 } }];
      },
    };
  }

  const measured = () => db.select().from(personalBests).where(eq(personalBests.source, "measured"));

  it("stores Garmin bests beside the athlete's own and keeps one snapshot", async () => {
    const result = await syncGarmin(db, fakeClient(), athleteId, { today: "2026-11-28", pauseMs: 0 });
    expect(result).toEqual({ runsRead: 150, bests: 1, activities: 150 });
    expect(await measured()).toMatchObject([{ distanceMetres: 5000, timeSeconds: 1400, garminActivityId: 1 }]);
    await syncGarmin(db, fakeClient(), athleteId, { today: "2026-11-28", pauseMs: 0 });
    expect(await measured()).toHaveLength(1);
    expect(await db.$count(activities)).toBe(150);
    expect(await db.select().from(garminSnapshots)).toMatchObject([{ maxHeartRate: 188, vo2Max: 50, runsRead: 150 }]);
    const own = await db.select().from(personalBests).where(eq(personalBests.source, "reported"));
    expect(own).toMatchObject([{ timeSeconds: 1500 }]);
  });

  it("changes nothing when Garmin fails partway", async () => {
    await db.update(garminSnapshots).set({ runsRead: 7 });
    await expect(syncGarmin(db, fakeClient("/metrics-service"), athleteId, { today: "2026-11-28", pauseMs: 0 })).rejects.toThrow(
      "slow down",
    );
    expect(await measured()).toHaveLength(1);
    expect(await db.select().from(garminSnapshots)).toMatchObject([{ runsRead: 7 }]);
  });

  it("treats an odd page of activities as a failure, not the end of the list", async () => {
    await expect(syncGarmin(db, fakeClient("bad-page"), athleteId, { today: "2026-11-28", pauseMs: 0 })).rejects.toThrow(
      "unexpected activity list",
    );
    expect(await db.$count(activities)).toBe(150);
  });
});
