CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('streaming', 'done', 'shortened', 'stopped', 'failed');--> statement-breakpoint
CREATE TABLE "coach_conversations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coach_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coach_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" "message_status" DEFAULT 'done' NOT NULL,
	"problem" text,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_conversation_id_coach_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."coach_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_messages_conversation" ON "coach_messages" USING btree ("conversation_id","id");