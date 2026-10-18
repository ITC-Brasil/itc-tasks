CREATE TABLE "task_imports" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_imports_source_uq" UNIQUE("source","source_id")
);
--> statement-breakpoint
ALTER TABLE "task_imports" ADD CONSTRAINT "task_imports_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;