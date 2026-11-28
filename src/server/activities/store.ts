// Runs as the rest of the app reads them. Relative imports: run in tests too.
import { and, asc, between } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Run } from "../../lib/runs";
import { isRunType } from "../garmin/extract";
import { activities, garminSnapshots } from "../db/schema";

type Reader = Pick<NodePgDatabase, "select">;

/** Runs of every kind between two dates inclusive, oldest first. */
export async function runsBetween(db: Reader, from: string, to: string): Promise<Run[]> {
  const rows = await db
    .select({
      id: activities.id,
      on: activities.on,
      type: activities.type,
      startLocal: activities.startLocal,
      distanceMetres: activities.distanceMetres,
      durationSeconds: activities.durationSeconds,
      averageHeartRate: activities.averageHeartRate,
      trainingLoad: activities.trainingLoad,
    })
    .from(activities)
    .where(and(between(activities.on, from, to)))
    .orderBy(asc(activities.startLocal));
  return rows.filter((row) => isRunType(row.type));
}

/** When Garmin was last synced, or undefined if never. */
export async function lastGarminSync(db: Reader): Promise<Date | undefined> {
  const [row] = await db.select({ at: garminSnapshots.syncedAt }).from(garminSnapshots).limit(1);
  return row?.at;
}
