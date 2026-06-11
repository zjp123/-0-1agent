CREATE TABLE "auth_admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" varchar(160) NOT NULL,
	"actor_auth_type" varchar(40) NOT NULL,
	"actor_token_id" varchar(160),
	"action" varchar(120) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" varchar(160) NOT NULL,
	"reason" text NOT NULL,
	"comment" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_admin_audit_events" ADD CONSTRAINT "auth_admin_audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_admin_audit_events_tenant_created_idx" ON "auth_admin_audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_admin_audit_events_target_idx" ON "auth_admin_audit_events" USING btree ("target_type","target_id");