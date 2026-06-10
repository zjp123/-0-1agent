ALTER TYPE "public"."indexing_job_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD COLUMN "dead_lettered_at" timestamp with time zone;