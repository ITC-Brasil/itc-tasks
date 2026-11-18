CREATE TABLE "involved_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_involved" (
	"task_id" uuid NOT NULL,
	"involved_id" uuid NOT NULL,
	CONSTRAINT "task_involved_task_id_involved_id_pk" PRIMARY KEY("task_id","involved_id")
);
--> statement-breakpoint
ALTER TABLE "task_involved" ADD CONSTRAINT "task_involved_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_involved" ADD CONSTRAINT "task_involved_involved_id_involved_people_id_fk" FOREIGN KEY ("involved_id") REFERENCES "public"."involved_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "involved_people_name_uq" ON "involved_people" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "task_involved_person_idx" ON "task_involved" USING btree ("involved_id");