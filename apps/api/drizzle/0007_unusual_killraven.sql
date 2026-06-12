CREATE TABLE "quota_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(160) NOT NULL,
	"action" varchar(120) NOT NULL,
	"subject_type" varchar(40) NOT NULL,
	"subject_id" varchar(160),
	"window_seconds" integer NOT NULL,
	"request_limit" integer,
	"token_limit" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" varchar(160),
	"action" varchar(120) NOT NULL,
	"subject_type" varchar(40) NOT NULL,
	"subject_id" varchar(160),
	"unit" varchar(40) NOT NULL,
	"amount" integer NOT NULL,
	"limit" integer,
	"window_key" varchar(240),
	"allowed" boolean NOT NULL,
	"reason" varchar(160) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quota_policies" ADD CONSTRAINT "quota_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_usage_events" ADD CONSTRAINT "quota_usage_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quota_policies_tenant_action_idx" ON "quota_policies" USING btree ("tenant_id","action");--> statement-breakpoint
CREATE INDEX "quota_policies_subject_idx" ON "quota_policies" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "quota_usage_events_tenant_created_idx" ON "quota_usage_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "quota_usage_events_action_created_idx" ON "quota_usage_events" USING btree ("action","created_at");