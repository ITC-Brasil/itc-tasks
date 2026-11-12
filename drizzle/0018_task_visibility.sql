CREATE TYPE "public"."task_visibility" AS ENUM('team', 'personal');--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "visibility" "task_visibility" DEFAULT 'team' NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_personal_creator_idx" ON "tasks" USING btree ("creator_id") WHERE "tasks"."visibility" = 'personal';--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_project_ck" CHECK ("tasks"."visibility" = 'personal' OR "tasks"."project_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_personal_owner_ck" CHECK ("tasks"."visibility" = 'team' OR ("tasks"."assignee_id" = "tasks"."creator_id" AND "tasks"."cycle_id" IS NULL AND "tasks"."milestone_id" IS NULL));