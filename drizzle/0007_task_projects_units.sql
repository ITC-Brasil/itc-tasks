CREATE TABLE "task_mobile_units" (
	"task_id" uuid NOT NULL,
	"mobile_unit_id" uuid NOT NULL,
	CONSTRAINT "task_mobile_units_task_id_mobile_unit_id_pk" PRIMARY KEY("task_id","mobile_unit_id")
);
--> statement-breakpoint
CREATE TABLE "task_projects" (
	"task_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "task_projects_task_id_project_id_pk" PRIMARY KEY("task_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "task_mobile_units" ADD CONSTRAINT "task_mobile_units_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_mobile_units" ADD CONSTRAINT "task_mobile_units_mobile_unit_id_mobile_units_id_fk" FOREIGN KEY ("mobile_unit_id") REFERENCES "public"."mobile_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_projects" ADD CONSTRAINT "task_projects_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_projects" ADD CONSTRAINT "task_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_mobile_units_unit_idx" ON "task_mobile_units" USING btree ("mobile_unit_id");--> statement-breakpoint
CREATE INDEX "task_projects_project_idx" ON "task_projects" USING btree ("project_id");--> statement-breakpoint
-- ADR-045: copia o projeto e a UM de cada tarefa existente (só INSERT, não reescreve tasks)
INSERT INTO "task_projects" ("task_id", "project_id")
SELECT "id", "project_id" FROM "tasks" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "task_mobile_units" ("task_id", "mobile_unit_id")
SELECT "id", "mobile_unit_id" FROM "tasks" WHERE "mobile_unit_id" IS NOT NULL ON CONFLICT DO NOTHING;
