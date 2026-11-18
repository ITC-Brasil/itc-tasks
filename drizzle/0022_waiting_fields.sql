CREATE TYPE "public"."waiting_reason" AS ENUM('purchase', 'supplier', 'third_party', 'client', 'other');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "waiting_reason" "waiting_reason";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "waiting_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "waiting_until" date;