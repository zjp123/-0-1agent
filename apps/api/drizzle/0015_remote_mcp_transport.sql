ALTER TABLE "mcp_servers" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "headers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "auth_type" varchar(40) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "auth_secret_ref" varchar(240);
