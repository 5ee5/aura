CREATE TYPE "public"."step_kind" AS ENUM('warmup', 'run', 'recovery', 'cooldown', 'repeat');--> statement-breakpoint
CREATE TYPE "public"."workout_status" AS ENUM('proposed', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."workout_type" AS ENUM('easy', 'recovery', 'long', 'tempo', 'threshold', 'vo2max', 'hills', 'progression', 'trail', 'race_specific');--> statement-breakpoint
CREATE TABLE "planned_workouts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "planned_workouts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"type" "workout_type" NOT NULL,
	"scheduled_on" date,
	"description" text NOT NULL,
	"status" "workout_status" DEFAULT 'proposed' NOT NULL,
	"conversation_id" integer,
	"message_id" integer,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_steps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workout_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workout_id" integer NOT NULL,
	"parent_id" integer,
	"position" smallint NOT NULL,
	"kind" "step_kind" NOT NULL,
	"repeat_count" smallint,
	"duration_s" integer,
	"distance_m" integer,
	"pace_fastest_s_per_km" smallint,
	"pace_slowest_s_per_km" smallint,
	"hr_min" smallint,
	"hr_max" smallint,
	"intensity" text,
	"instructions" text,
	CONSTRAINT "workout_steps_shape" CHECK (case when "workout_steps"."kind" = 'repeat'
        then "workout_steps"."repeat_count" between 2 and 50 and "workout_steps"."duration_s" is null and "workout_steps"."distance_m" is null
        else "workout_steps"."repeat_count" is null and ("workout_steps"."duration_s" is null) <> ("workout_steps"."distance_m" is null) end),
	CONSTRAINT "workout_steps_amount_positive" CHECK ("workout_steps"."duration_s" > 0 and "workout_steps"."distance_m" > 0)
);
--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_conversation_id_coach_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."coach_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_message_id_coach_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."coach_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_steps" ADD CONSTRAINT "workout_steps_workout_id_planned_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."planned_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_steps" ADD CONSTRAINT "workout_steps_parent_id_workout_steps_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."workout_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_workouts_message" ON "planned_workouts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "planned_workouts_status" ON "planned_workouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workout_steps_workout" ON "workout_steps" USING btree ("workout_id");