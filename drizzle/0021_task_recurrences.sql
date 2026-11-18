CREATE TABLE "task_recurrence_runs" (
	"recurrence_id" uuid NOT NULL,
	"run_on" date NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_recurrence_runs_recurrence_id_run_on_pk" PRIMARY KEY("recurrence_id","run_on")
);
--> statement-breakpoint
CREATE TABLE "task_recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"visibility" "task_visibility" DEFAULT 'team' NOT NULL,
	"owner_id" text NOT NULL,
	"frequency" text NOT NULL,
	"weekdays" smallint[],
	"month_day" smallint,
	"interval_months" smallint DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"due_in_days" smallint DEFAULT 0 NOT NULL,
	"due_time" time,
	"payload" jsonb NOT NULL,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_recurrences_frequency_ck" CHECK ("task_recurrences"."frequency" IN ('weekdays', 'weekly', 'monthly')),
	CONSTRAINT "task_recurrences_interval_ck" CHECK ("task_recurrences"."interval_months" BETWEEN 1 AND 12)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "task_recurrence_runs" ADD CONSTRAINT "task_recurrence_runs_recurrence_id_task_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."task_recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_recurrence_runs" ADD CONSTRAINT "task_recurrence_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_recurrences_owner_idx" ON "task_recurrences" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_id_task_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."task_recurrences"("id") ON DELETE set null ON UPDATE no action;