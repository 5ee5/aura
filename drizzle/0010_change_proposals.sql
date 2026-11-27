ALTER TYPE "public"."workout_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "change_proposals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "change_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"summary" text NOT NULL,
	"changes" jsonb NOT NULL,
	"status" "workout_status" DEFAULT 'proposed' NOT NULL,
	"conversation_id" integer,
	"message_id" integer,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_conversation_id_coach_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."coach_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_message_id_coach_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."coach_messages"("id") ON DELETE set null ON UPDATE no action;