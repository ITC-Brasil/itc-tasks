ALTER TABLE "user" ADD COLUMN "initials" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "theme" text DEFAULT 'light';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "sidebar_collapsed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quiet_hours_start" text DEFAULT '08:00';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quiet_hours_end" text DEFAULT '18:00';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_digest" boolean DEFAULT true;