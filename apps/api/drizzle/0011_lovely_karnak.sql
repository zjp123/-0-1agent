CREATE TABLE "orchestration_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"from_participant_id" uuid,
	"to_participant_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"status" varchar(40) DEFAULT 'pending' NOT NULL,
	"input" text NOT NULL,
	"output" text,
	"error" text,
	"agent_request_id" varchar(160),
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestration_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"role" varchar(80) NOT NULL,
	"system_prompt" text,
	"model" varchar(160),
	"enabled" boolean DEFAULT true NOT NULL,
	"max_steps" integer DEFAULT 4 NOT NULL,
	"max_duration_ms" integer DEFAULT 60000 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" varchar(160) NOT NULL,
	"request_id" varchar(160) NOT NULL,
	"objective" text NOT NULL,
	"strategy" varchar(80) DEFAULT 'sequential_handoff' NOT NULL,
	"status" varchar(40) DEFAULT 'pending' NOT NULL,
	"participant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_answer" text,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orchestration_handoffs" ADD CONSTRAINT "orchestration_handoffs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_handoffs" ADD CONSTRAINT "orchestration_handoffs_run_id_orchestration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."orchestration_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_handoffs" ADD CONSTRAINT "orchestration_handoffs_from_participant_id_orchestration_participants_id_fk" FOREIGN KEY ("from_participant_id") REFERENCES "public"."orchestration_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_handoffs" ADD CONSTRAINT "orchestration_handoffs_to_participant_id_orchestration_participants_id_fk" FOREIGN KEY ("to_participant_id") REFERENCES "public"."orchestration_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_participants" ADD CONSTRAINT "orchestration_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orchestration_handoffs_tenant_run_idx" ON "orchestration_handoffs" USING btree ("tenant_id","run_id","step_order");--> statement-breakpoint
CREATE INDEX "orchestration_handoffs_participant_status_idx" ON "orchestration_handoffs" USING btree ("to_participant_id","status");--> statement-breakpoint
CREATE INDEX "orchestration_participants_tenant_role_idx" ON "orchestration_participants" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "orchestration_participants_tenant_enabled_idx" ON "orchestration_participants" USING btree ("tenant_id","enabled");--> statement-breakpoint
CREATE INDEX "orchestration_runs_tenant_status_idx" ON "orchestration_runs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "orchestration_runs_request_idx" ON "orchestration_runs" USING btree ("request_id");