// Athlete tables. Loaded by drizzle-kit as well as the app: no "@/" imports.
import { sql } from "drizzle-orm";
import { STEP_KINDS, WORKOUT_TYPE_KEYS } from "../../lib/workout";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Where a number came from. Every table holding metrics carries one. */
export const dataSource = pgEnum("data_source", ["reported", "measured", "calculated", "estimated"]);
export const goalStatus = pgEnum("goal_status", ["active", "achieved", "abandoned"]);
export const surface = pgEnum("surface", ["road", "trail", "track"]);
export const workoutType = pgEnum("workout_type", WORKOUT_TYPE_KEYS);
export const workoutStatus = pgEnum("workout_status", [
  "proposed",
  "approved",
  "declined",
  "replaced",
  "cancelled",
]);
export const stepKind = pgEnum("step_kind", STEP_KINDS);
export const workoutOutcome = pgEnum("workout_outcome", ["done", "skipped"]);
export const blockFocus = pgEnum("block_focus", ["base", "build", "peak", "taper", "recovery", "race"]);
export const messageRole = pgEnum("message_role", ["user", "assistant"]);
/** "streaming" left behind by a restart counts as stopped. */
export const messageStatus = pgEnum("message_status", [
  "streaming",
  "done",
  "shortened",
  "stopped",
  "failed",
]);

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

export const coachConversations = pgTable("coach_conversations", {
  id: id(),
  /** The start of the first message. */
  title: text().notNull(),
  ...timestamps,
});

export const coachMessages = pgTable(
  "coach_messages",
  {
    id: id(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => coachConversations.id, { onDelete: "cascade" }),
    role: messageRole().notNull(),
    content: text().notNull().default(""),
    status: messageStatus().notNull().default("done"),
    /** Why a reply failed or was cut short, as shown in the chat. */
    problem: text(),
    /** The coach read the athlete's profile to write this reply. */
    usedProfile: boolean("used_profile").notNull().default(false),
    /** Written by the mock, so it is never presented as the coach. */
    mock: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coach_messages_conversation").on(t.conversationId, t.id)],
);

/** A week the coach proposed: its workouts are planned_workouts that point here. */
export const weekProposals = pgTable("week_proposals", {
  id: id(),
  weekStart: date("week_start").notNull(),
  summary: text().notNull(),
  /** The coach's note for each day, rest days included: [{ date, note }]. */
  dayNotes: jsonb("day_notes").$type<{ date: string; note: string }[]>().notNull().default([]),
  conversationId: integer("conversation_id").references(() => coachConversations.id, { onDelete: "set null" }),
  messageId: integer("message_id").references(() => coachMessages.id, { onDelete: "set null" }),
  mock: boolean().notNull().default(false),
  ...timestamps,
});

/** Proposed by the coach; only the athlete approves. */
export const plannedWorkouts = pgTable(
  "planned_workouts",
  {
    id: id(),
    title: text().notNull(),
    type: workoutType().notNull(),
    scheduledOn: date("scheduled_on"),
    description: text().notNull(),
    status: workoutStatus().notNull().default("proposed"),
    conversationId: integer("conversation_id").references(() => coachConversations.id, {
      onDelete: "set null",
    }),
    /** The reply that proposed it, where its card is shown. */
    messageId: integer("message_id").references(() => coachMessages.id, { onDelete: "set null" }),
    mock: boolean().notNull().default(false),
    /** Marked by the athlete once the day has come. Null: not marked. */
    outcome: workoutOutcome(),
    /** Set when it was proposed as part of a week. */
    weekProposalId: integer("week_proposal_id").references((): AnyPgColumn => weekProposals.id, {
      onDelete: "set null",
    }),
    /** The earlier workout this one revises. */
    replacesId: integer("replaces_id").references((): AnyPgColumn => plannedWorkouts.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("planned_workouts_message").on(t.messageId), index("planned_workouts_status").on(t.status)],
);

export const workoutSteps = pgTable(
  "workout_steps",
  {
    id: id(),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => plannedWorkouts.id, { onDelete: "cascade" }),
    /** Set for a step inside a repeat. */
    parentId: integer("parent_id").references((): AnyPgColumn => workoutSteps.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    kind: stepKind().notNull(),
    repeatCount: smallint("repeat_count"),
    durationSeconds: integer("duration_s"),
    distanceMetres: integer("distance_m"),
    /** Seconds per kilometre. */
    paceFastest: smallint("pace_fastest_s_per_km"),
    paceSlowest: smallint("pace_slowest_s_per_km"),
    heartRateMin: smallint("hr_min"),
    heartRateMax: smallint("hr_max"),
    intensity: text(),
    instructions: text(),
  },
  (t) => [
    index("workout_steps_workout").on(t.workoutId),
    check(
      "workout_steps_shape",
      sql`case when ${t.kind} = 'repeat'
        then ${t.repeatCount} between 2 and 50 and ${t.durationSeconds} is null and ${t.distanceMetres} is null
        else ${t.repeatCount} is null and (${t.durationSeconds} is null) <> (${t.distanceMetres} is null) end`,
    ),
    check("workout_steps_amount_positive", sql`${t.durationSeconds} > 0 and ${t.distanceMetres} > 0`),
  ],
);

/** One row per request to Claude, for the daily spending limit. */
export const coachUsage = pgTable(
  "coach_usage",
  {
    id: id(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    model: text().notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Our estimate, not the bill. Starts at the most the request could cost. */
    costUsd: numeric("cost_usd", { precision: 10, scale: 6, mode: "number" }).notNull(),
  },
  (t) => [index("coach_usage_created_at").on(t.createdAt)],
);

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

/** A training plan towards a goal, split into blocks. */
export const trainingPlans = pgTable(
  "training_plans",
  {
    id: id(),
    name: text().notNull(),
    goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
    startOn: date("start_on").notNull(),
    endOn: date("end_on").notNull(),
    notes: text(),
    ...timestamps,
  },
  (t) => [check("training_plans_dates_ordered", sql`${t.endOn} >= ${t.startOn}`)],
);

/** A stretch of a plan with one focus. The coach can propose one; the athlete approves. */
export const trainingBlocks = pgTable(
  "training_blocks",
  {
    id: id(),
    planId: integer("plan_id")
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "cascade" }),
    name: text().notNull(),
    focus: blockFocus().notNull(),
    startOn: date("start_on").notNull(),
    endOn: date("end_on").notNull(),
    /** A target for each week, roughly; null when not set. */
    weeklyMinutes: integer("weekly_minutes"),
    notes: text(),
    status: workoutStatus().notNull().default("approved"),
    conversationId: integer("conversation_id").references(() => coachConversations.id, {
      onDelete: "set null",
    }),
    messageId: integer("message_id").references(() => coachMessages.id, { onDelete: "set null" }),
    mock: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("training_blocks_plan").on(t.planId),
    check("training_blocks_dates_ordered", sql`${t.endOn} >= ${t.startOn}`),
    check("training_blocks_minutes_range", sql`${t.weeklyMinutes} between 0 and 3000`),
  ],
);

/** Changes to approved workouts, proposed by the coach as one set. */
export const changeProposals = pgTable("change_proposals", {
  id: id(),
  summary: text().notNull(),
  changes: jsonb()
    .$type<{ workoutId: number; title: string; action: "move" | "cancel"; from: string | null; to: string | null }[]>()
    .notNull(),
  status: workoutStatus().notNull().default("proposed"),
  conversationId: integer("conversation_id").references(() => coachConversations.id, { onDelete: "set null" }),
  messageId: integer("message_id").references(() => coachMessages.id, { onDelete: "set null" }),
  mock: boolean().notNull().default(false),
  ...timestamps,
});
