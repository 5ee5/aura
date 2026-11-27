CREATE TABLE "week_proposals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "week_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"week_start" date NOT NULL,
	"summary" text NOT NULL,
	"day_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conversation_id" integer,
	"message_id" integer,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD COLUMN "week_proposal_id" integer;--> statement-breakpoint
ALTER TABLE "week_proposals" ADD CONSTRAINT "week_proposals_conversation_id_coach_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."coach_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_proposals" ADD CONSTRAINT "week_proposals_message_id_coach_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."coach_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_workouts" ADD CONSTRAINT "planned_workouts_week_proposal_id_week_proposals_id_fk" FOREIGN KEY ("week_proposal_id") REFERENCES "public"."week_proposals"("id") ON DELETE set null ON UPDATE no action;