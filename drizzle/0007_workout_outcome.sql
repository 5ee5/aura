CREATE TYPE "public"."workout_outcome" AS ENUM('done', 'skipped');--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD COLUMN "outcome" "workout_outcome";