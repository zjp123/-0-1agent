CREATE TYPE "public"."indexing_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "indexing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"type" varchar(80) NOT NULL,
	"status" "indexing_job_status" DEFAULT 'pending' NOT NULL,
	"total_chunks" integer DEFAULT 0 NOT NULL,
	"processed_chunks" integer DEFAULT 0 NOT NULL,
	"failed_chunks" integer DEFAULT 0 NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD CONSTRAINT "indexing_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indexing_jobs" ADD CONSTRAINT "indexing_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indexing_jobs_tenant_status_idx" ON "indexing_jobs" USING btree ("tenant_id","status");