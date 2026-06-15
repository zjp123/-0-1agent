CREATE TABLE "workflow_schedule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"triggered_by" varchar(80) NOT NULL,
	"worker_id" varchar(160),
	"status" varchar(40) DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"output" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"created_by" uuid,
	"name" varchar(160) NOT NULL,
	"schedule_type" varchar(40) NOT NULL,
	"cron_expression" varchar(120),
	"interval_seconds" integer,
	"timezone" varchar(80) DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_concurrent_runs" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"lease_owner" varchar(160),
	"lease_until" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_schedule_runs" ADD CONSTRAINT "workflow_schedule_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule_runs" ADD CONSTRAINT "workflow_schedule_runs_schedule_id_workflow_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."workflow_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule_runs" ADD CONSTRAINT "workflow_schedule_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_schedule_runs_tenant_schedule_idx" ON "workflow_schedule_runs" USING btree ("tenant_id","schedule_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_schedule_runs_status_idx" ON "workflow_schedule_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "workflow_schedules_tenant_next_run_idx" ON "workflow_schedules" USING btree ("tenant_id","enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "workflow_schedules_workflow_idx" ON "workflow_schedules" USING btree ("tenant_id","workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_schedules_lease_idx" ON "workflow_schedules" USING btree ("lease_until");