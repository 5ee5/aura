// Reads bests, heart rate and VO2 max from Garmin and stores them.
// Everything is fetched first; the old Garmin data is replaced only once it all arrived.
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { addDays } from "../../lib/dates";
import { garminSnapshots, personalBests } from "../db/schema";
import type { GarminClient } from "./client";
import { bestsFromActivities, heartRateFromZones, isOutdoorRun, latestVo2Max } from "./extract";

const PAGE = 100;
/** Enough for years of daily running; stops a runaway loop if Garmin keeps returning pages. */
const MAX_ACTIVITIES = 10_000;

export interface SyncResult {
  runsRead: number;
  bests: number;
}

interface Options {
  /** Today, YYYY-MM-DD, for the VO2 max range. */
  today: string;
  /** Pause between activity pages, to go easy on Garmin's undocumented limits. */
  pauseMs?: number;
}

async function allActivities(client: GarminClient, pauseMs: number): Promise<unknown[]> {
  const activities: unknown[] = [];
  for (let start = 0; start < MAX_ACTIVITIES; start += PAGE) {
    const page = await client.get(`/activitylist-service/activities/search/activities?start=${start}&limit=${PAGE}`);
    if (!Array.isArray(page)) break;
    activities.push(...page);
    if (page.length < PAGE) break;
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  return activities;
}

export async function syncGarmin(
  db: NodePgDatabase,
  client: GarminClient,
  athleteId: number,
  { today, pauseMs = 300 }: Options,
): Promise<SyncResult> {
  const activities = await allActivities(client, pauseMs);
  const heartRate = heartRateFromZones(await client.get("/biometric-service/heartRateZones/v2"));
  const vo2 = latestVo2Max(await client.get(`/metrics-service/metrics/maxmet/daily/${addDays(today, -90)}/${today}`));
  const bests = bestsFromActivities(activities);
  const runsRead = activities.filter((a) => a && typeof a === "object" && isOutdoorRun(a as never)).length;

  await db.transaction(async (tx) => {
    // Only Garmin's own rows; bests the athlete typed in are never touched.
    await tx
      .delete(personalBests)
      .where(and(eq(personalBests.athleteId, athleteId), eq(personalBests.source, "measured")));
    if (bests.length)
      await tx.insert(personalBests).values(
        bests.map((best) => ({
          athleteId,
          distanceMetres: best.distanceMetres,
          timeSeconds: best.timeSeconds,
          achievedOn: best.achievedOn,
          source: "measured" as const,
          garminActivityId: best.activityId,
        })),
      );
    const snapshot = {
      athleteId,
      ...heartRate,
      vo2Max: vo2?.vo2Max ?? null,
      vo2MaxOn: vo2?.on ?? null,
      runsRead,
      syncedAt: new Date(),
    };
    await tx.delete(garminSnapshots);
    await tx.insert(garminSnapshots).values(snapshot);
  });

  return { runsRead, bests: bests.length };
}
