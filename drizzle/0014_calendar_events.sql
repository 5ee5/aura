CREATE TABLE "calendar_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calendar_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"calendar_name" text NOT NULL,
	"title" text,
	"all_day" boolean NOT NULL,
	"start_local" timestamp NOT NULL,
	"end_local" timestamp NOT NULL,
	"busy" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_accounts" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "calendar_events_start" ON "calendar_events" USING btree ("start_local");