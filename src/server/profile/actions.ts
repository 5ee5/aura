"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { requireSession } from "@/server/auth/dal";
import { getDb } from "@/server/db/client";
import { goals, injuries, raceResults } from "@/server/db/schema";
import * as data from "./data";
import { aboutSchema, goalSchema, injurySchema, parseWeek, parseWith, raceSchema } from "./validation";

const idSchema = z.coerce.number().int().positive();
const NO_ATHLETE = { error: "Save your name first." };
const GONE = { error: "That entry no longer exists. Reload the page." };

function saved(): FormState {
  revalidatePath("/profile");
  return { ok: true };
}

const fields = (form: FormData) => Object.fromEntries(form);

export async function saveAbout(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const about = parseWith(aboutSchema, {
    ...fields(form),
    preferredWorkoutTypes: form.getAll("preferredWorkoutTypes"),
  });
  if (about.error !== undefined) return { error: about.error };
  await data.saveAthlete(about.data);
  return saved();
}

export async function saveWeek(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const week = parseWeek(fields(form));
  if (week.error !== undefined) return { error: week.error };
  const athlete = await data.getAthlete();
  if (!athlete) return NO_ATHLETE;
  await data.replaceWeek(athlete.id, week.data);
  return saved();
}

type EntryTable = typeof goals | typeof raceResults | typeof injuries;

/** Adds an entry, or updates the one named by the form's "id". */
async function saveEntry<T extends object>(
  table: EntryTable,
  schema: z.ZodType<T>,
  form: FormData,
  extra: object = {},
): Promise<FormState> {
  const entry = parseWith(schema, fields(form));
  if (entry.error !== undefined) return { error: entry.error };
  const athlete = await data.getAthlete();
  if (!athlete) return NO_ATHLETE;

  // The schema for each table was chosen by the caller, so the shapes match.
  const values = { ...entry.data, ...extra, athleteId: athlete.id } as never;
  const db = getDb();
  if (!form.has("id")) {
    await db.insert(table).values(values);
  } else {
    const id = idSchema.safeParse(form.get("id"));
    if (!id.success) return GONE;
    const updated = await db
      .update(table)
      .set(values)
      .where(and(eq(table.id, id.data), eq(table.athleteId, athlete.id)))
      .returning({ id: table.id });
    if (updated.length === 0) return GONE;
  }
  return saved();
}

export async function saveGoal(_state: FormState, form: FormData) {
  await requireSession();
  return saveEntry(goals, goalSchema, form);
}

export async function saveRace(_state: FormState, form: FormData) {
  await requireSession();
  return saveEntry(raceResults, raceSchema, form, { source: "reported" });
}

export async function saveInjury(_state: FormState, form: FormData) {
  await requireSession();
  return saveEntry(injuries, injurySchema, form);
}

export async function removeEntry(_state: FormState, form: FormData): Promise<FormState> {
  await requireSession();
  const target = z
    .object({ kind: z.enum(["goal", "race", "injury"]), id: idSchema })
    .safeParse(fields(form));
  const athlete = await data.getAthlete();
  if (!target.success || !athlete) return GONE;
  await data.deleteEntry(target.data.kind, athlete.id, target.data.id);
  return saved();
}
