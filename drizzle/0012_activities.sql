CREATE TABLE "activities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"garmin_id" bigint NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"start_local" timestamp NOT NULL,
	"on" date NOT NULL,
	"distance_m" real,
	"duration_s" real NOT NULL,
	"moving_s" real,
	"elevation_gain_m" real,
	"avg_hr" smallint,
	"max_hr" smallint,
	"avg_cadence" real,
	"training_load" real,
	"aerobic_effect" real,
	"anaerobic_effect" real,
	"hr_zone_s" jsonb,
	CONSTRAINT "activities_garmin_id_unique" UNIQUE("garmin_id")
);
--> statement-breakpoint
CREATE INDEX "activities_on" ON "activities" USING btree ("on");