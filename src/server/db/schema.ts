// Athlete tables. Loaded by drizzle-kit as well as the app: no "@/" imports.
import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Where a number came from. Every table holding metrics carries one. */
export const dataSource = pgEnum("data_source", ["reported", "measured", "calculated", "estimated"]);
export const goalStatus = pgEnum("goal_status", ["active", "achieved", "abandoned"]);
export const surface = pgEnum("surface", ["road", "trail", "track"]);

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const athleteId = () =>
  integer("athlete_id")
    .notNull()
    .references(() => athletes.id, { onDelete: "cascade" });
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
const seconds = (name: string) => numeric(name, { precision: 9, scale: 2, mode: "number" });

export const athletes = pgTable(
  "athletes",
  {
    id: id(),
    name: text().notNull(),
    trainingPreferences: text("training_preferences"),
    preferredWorkoutTypes: text("preferred_workout_types").array().notNull().default([]),
    ...timestamps,
  },
  // One user, one row: every row has the same key in this index.
  () => [uniqueIndex("athletes_only_one").on(sql`(true)`)],
);

export const goals = pgTable(
  "goals",
  {
    id: id(),
    athleteId: athleteId(),
    description: text().notNull(),
    raceName: text("race_name"),
    raceDate: date("race_date"),
    distanceMetres: integer("distance_m"),
    targetSeconds: seconds("target_time_s"),
    status: goalStatus().notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    check("goals_distance_positive", sql`${t.distanceMetres} > 0`),
    check("goals_target_positive", sql`${t.targetSeconds} > 0`),
  ],
);

export const personalBests = pgTable(
  "personal_bests",
  {
    id: id(),
    athleteId: athleteId(),
    distanceMetres: integer("distance_m").notNull(),
    timeSeconds: seconds("time_s").notNull(),
    achievedOn: date("achieved_on"),
    source: dataSource().notNull(),
    ...timestamps,
  },
  (t) => [
    // A reported best and a measured one may both exist for a distance.
    unique("personal_bests_one_per_source").on(t.athleteId, t.distanceMetres, t.source),
    check("personal_bests_distance_positive", sql`${t.distanceMetres} > 0`),
    check("personal_bests_time_positive", sql`${t.timeSeconds} > 0`),
  ],
);

export const raceResults = pgTable(
  "race_results",
  {
    id: id(),
    athleteId: athleteId(),
    name: text().notNull(),
    raceDate: date("race_date").notNull(),
    distanceMetres: integer("distance_m").notNull(),
    elevationGainMetres: integer("elevation_gain_m"),
    surface: surface().notNull(),
    /** Null when the race was not finished. */
    timeSeconds: seconds("time_s"),
    source: dataSource().notNull(),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    check("race_results_distance_positive", sql`${t.distanceMetres} > 0`),
    check("race_results_elevation_not_negative", sql`${t.elevationGainMetres} >= 0`),
    check("race_results_time_positive", sql`${t.timeSeconds} > 0`),
  ],
);

export const injuries = pgTable(
  "injuries",
  {
    id: id(),
    athleteId: athleteId(),
    bodyArea: text("body_area").notNull(),
    description: text().notNull(),
    startedOn: date("started_on").notNull(),
    /** Null while the injury is current. */
    resolvedOn: date("resolved_on"),
    ...timestamps,
  },
  (t) => [check("injuries_dates_ordered", sql`${t.resolvedOn} >= ${t.startedOn}`)],
);

export const availability = pgTable(
  "availability",
  {
    id: id(),
    athleteId: athleteId(),
    /** ISO weekday: 1 is Monday. */
    weekday: smallint().notNull(),
    maxMinutes: integer("max_minutes").notNull(),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    unique("availability_one_per_weekday").on(t.athleteId, t.weekday),
    check("availability_weekday_range", sql`${t.weekday} between 1 and 7`),
    check("availability_minutes_range", sql`${t.maxMinutes} between 0 and 1440`),
  ],
);
