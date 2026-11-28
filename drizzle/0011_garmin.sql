CREATE TABLE "garmin_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "garmin_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"athlete_id" integer NOT NULL,
	"max_hr" smallint,
	"resting_hr" smallint,
	"lactate_threshold_hr" smallint,
	"hr_zones" jsonb,
	"vo2_max" numeric(4, 1),
	"vo2_max_on" date,
	"runs_read" integer NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_bests" ADD COLUMN "garmin_activity_id" bigint;--> statement-breakpoint
ALTER TABLE "garmin_snapshots" ADD CONSTRAINT "garmin_snapshots_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "garmin_snapshots_only_one" ON "garmin_snapshots" USING btree ((true));