CREATE TYPE "public"."block_focus" AS ENUM('base', 'build', 'peak', 'taper', 'recovery', 'race');--> statement-breakpoint
CREATE TABLE "training_blocks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "training_blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plan_id" integer NOT NULL,
	"name" text NOT NULL,
	"focus" "block_focus" NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date NOT NULL,
	"weekly_minutes" integer,
	"notes" text,
	"status" "workout_status" DEFAULT 'approved' NOT NULL,
	"conversation_id" integer,
	"message_id" integer,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_blocks_dates_ordered" CHECK ("training_blocks"."end_on" >= "training_blocks"."start_on"),
	CONSTRAINT "training_blocks_minutes_range" CHECK ("training_blocks"."weekly_minutes" between 0 and 3000)
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "training_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"goal_id" integer,
	"start_on" date NOT NULL,
	"end_on" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_plans_dates_ordered" CHECK ("training_plans"."end_on" >= "training_plans"."start_on")
);
--> statement-breakpoint
ALTER TABLE "training_blocks" ADD CONSTRAINT "training_blocks_plan_id_training_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_blocks" ADD CONSTRAINT "training_blocks_conversation_id_coach_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."coach_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_blocks" ADD CONSTRAINT "training_blocks_message_id_coach_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."coach_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_blocks_plan" ON "training_blocks" USING btree ("plan_id");