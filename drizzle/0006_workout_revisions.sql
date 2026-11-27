ALTER TYPE "public"."workout_status" ADD VALUE 'replaced';--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD COLUMN "replaces_id" integer;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_replaces_id_planned_workouts_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."planned_workouts"("id") ON DELETE set null ON UPDATE no action;