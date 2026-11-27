CREATE TYPE "public"."data_source" AS ENUM('reported', 'measured', 'calculated', 'estimated');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'achieved', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."surface" AS ENUM('road', 'trail', 'track');--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "athletes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"training_preferences" text,
	"preferred_workout_types" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "availability_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"athlete_id" integer NOT NULL,
	"weekday" smallint NOT NULL,
	"max_minutes" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_one_per_weekday" UNIQUE("athlete_id","weekday"),
	CONSTRAINT "availability_weekday_range" CHECK ("availability"."weekday" between 1 and 7),
	CONSTRAINT "availability_minutes_range" CHECK ("availability"."max_minutes" between 0 and 1440)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "goals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"athlete_id" integer NOT NULL,
	"description" text NOT NULL,
	"race_name" text,
	"race_date" date,
	"distance_m" integer,
	"target_time_s" numeric(9, 2),
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_distance_positive" CHECK ("goals"."distance_m" > 0),
	CONSTRAINT "goals_target_positive" CHECK ("goals"."target_time_s" > 0)
);
--> statement-breakpoint
CREATE TABLE "injuries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "injuries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"athlete_id" integer NOT NULL,
	"body_area" text NOT NULL,
	"description" text NOT NULL,
	"started_on" date NOT NULL,
	"resolved_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "injuries_dates_ordered" CHECK ("injuries"."resolved_on" >= "injuries"."started_on")
);
--> statement-breakpoint
CREATE TABLE "personal_bests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "personal_bests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"athlete_id" integer NOT NULL,
	"distance_m" integer NOT NULL,
	"time_s" numeric(9, 2) NOT NULL,
	"achieved_on" date,
	"source" "data_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_bests_one_per_source" UNIQUE("athlete_id","distance_m","source"),
	CONSTRAINT "personal_bests_distance_positive" CHECK ("personal_bests"."distance_m" > 0),
	CONSTRAINT "personal_bests_time_positive" CHECK ("personal_bests"."time_s" > 0)
);
--> statement-breakpoint
CREATE TABLE "race_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "race_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"athlete_id" integer NOT NULL,
	"name" text NOT NULL,
	"race_date" date NOT NULL,
	"distance_m" integer NOT NULL,
	"elevation_gain_m" integer,
	"surface" "surface" NOT NULL,
	"time_s" numeric(9, 2),
	"source" "data_source" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_results_distance_positive" CHECK ("race_results"."distance_m" > 0),
	CONSTRAINT "race_results_elevation_not_negative" CHECK ("race_results"."elevation_gain_m" >= 0),
	CONSTRAINT "race_results_time_positive" CHECK ("race_results"."time_s" > 0)
);
--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;