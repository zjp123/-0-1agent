ALTER TABLE "indexing_jobs" ADD COLUMN "worker_id" varchar(160);--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD COLUMN "lease_until" timestamp with time zone;