CREATE TABLE "security_anomaly_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"severity" varchar(40) NOT NULL,
	"category" varchar(80) NOT NULL,
	"action" varchar(120) NOT NULL,
	"actor_user_id" varchar(160),
	"actor_auth_type" varchar(40),
	"target_type" varchar(80),
	"target_id" varchar(160),
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" varchar(160),
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_anomaly_events" ADD CONSTRAINT "security_anomaly_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "security_anomaly_events_tenant_created_idx" ON "security_anomaly_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "security_anomaly_events_tenant_severity_idx" ON "security_anomaly_events" USING btree ("tenant_id","severity");--> statement-breakpoint
CREATE INDEX "security_anomaly_events_tenant_category_idx" ON "security_anomaly_events" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "security_anomaly_events_tenant_acknowledged_idx" ON "security_anomaly_events" USING btree ("tenant_id","acknowledged");