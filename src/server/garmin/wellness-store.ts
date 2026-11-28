// Stored recovery days. Relative imports: run in tests too.
import { asc, between } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { WellnessDay } from "../../lib/recovery";
import { dailyWellness } from "../db/schema";

type Reader = Pick<NodePgDatabase, "select">;

export async function wellnessBetween(db: Reader, from: string, to: string): Promise<WellnessDay[]> {
  return db
    .select({
      on: dailyWellness.on,
      sleepSeconds: dailyWellness.sleepSeconds,
      sleepScore: dailyWellness.sleepScore,
      hrvLastNight: dailyWellness.hrvLastNight,
      hrvBalancedLow: dailyWellness.hrvBalancedLow,
      hrvBalancedHigh: dailyWellness.hrvBalancedHigh,
      hrvStatus: dailyWellness.hrvStatus,
      restingHeartRate: dailyWellness.restingHeartRate,
      stressAverage: dailyWellness.stressAverage,
      bodyBatteryHigh: dailyWellness.bodyBatteryHigh,
    })
    .from(dailyWellness)
    .where(between(dailyWellness.on, from, to))
    .orderBy(asc(dailyWellness.on));
}
