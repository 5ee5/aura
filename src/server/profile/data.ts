import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { athletes, availability, goals, injuries, personalBests, raceResults } from "@/server/db/schema";

/** There is one athlete; the database allows no second row. */
export async function getAthlete() {
  const [athlete] = await getDb().select().from(athletes).limit(1);
  return athlete;
}

export async function getProfile() {
  const athlete = await getAthlete();
  if (!athlete) return undefined;
  const db = getDb();
  const [week, goalList, bests, races, injuryList] = await Promise.all([
    db.select().from(availability).where(eq(availability.athleteId, athlete.id)),
    db
      .select()
      .from(goals)
      .where(eq(goals.athleteId, athlete.id))
      .orderBy(asc(goals.status), asc(goals.raceDate), asc(goals.id)),
    db
      .select()
      .from(personalBests)
      .where(eq(personalBests.athleteId, athlete.id))
      .orderBy(asc(personalBests.distanceMetres)),
    db
      .select()
      .from(raceResults)
      .where(eq(raceResults.athleteId, athlete.id))
      .orderBy(desc(raceResults.raceDate)),
    db
      .select()
      .from(injuries)
      .where(eq(injuries.athleteId, athlete.id))
      // Current injuries (no end date) first.
      .orderBy(sql`${injuries.resolvedOn} is not null`, desc(injuries.startedOn)),
  ]);
  return { athlete, week, goals: goalList, bests, races, injuries: injuryList };
}

export async function saveAthlete(values: typeof athletes.$inferInsert) {
  const db = getDb();
  // A second submit conflicts with the one-row index and falls through to update.
  const created = await db.insert(athletes).values(values).onConflictDoNothing().returning();
  if (created.length === 0) await db.update(athletes).set(values);
}

export async function replaceWeek(
  athleteId: number,
  days: { weekday: number; maxMinutes: number; notes: string | null }[],
) {
  await getDb().transaction(async (tx) => {
    await tx.delete(availability).where(eq(availability.athleteId, athleteId));
    if (days.length) await tx.insert(availability).values(days.map((d) => ({ ...d, athleteId })));
  });
}

export const ENTRY_TABLES = {
  goal: goals,
  best: personalBests,
  race: raceResults,
  injury: injuries,
} as const;
export type EntryKind = keyof typeof ENTRY_TABLES;

export async function deleteEntry(kind: EntryKind, athleteId: number, id: number) {
  const table = ENTRY_TABLES[kind];
  await getDb().delete(table).where(and(eq(table.id, id), eq(table.athleteId, athleteId)));
}
