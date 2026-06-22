CREATE TYPE "public"."mcp_server_status" AS ENUM('pending_approval', 'active', 'disabled', 'error');--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"transport" varchar(40) DEFAULT 'stdio' NOT NULL,
	"command" varchar(240) NOT NULL,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"status" "mcp_server_status" DEFAULT 'pending_approval' NOT NULL,
	"risk_level" varchar(40) DEFAULT 'medium' NOT NULL,
	"required_permissions" jsonb DEFAULT '["tools:execute"]'::jsonb NOT NULL,
	"tool_name_prefix" varchar(120),
	"timeout_ms" integer,
	"command_policy" varchar(80) DEFAULT 'allowlist' NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"last_loaded_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(160) NOT NULL,
	"approved_by" varchar(160),
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_servers_tenant_name_idx" ON "mcp_servers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "mcp_servers_tenant_status_idx" ON "mcp_servers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "mcp_servers_tenant_enabled_idx" ON "mcp_servers" USING btree ("tenant_id","enabled");
