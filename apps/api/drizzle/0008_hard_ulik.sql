CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"provider" varchar(80) NOT NULL,
	"credential_type" varchar(80) NOT NULL,
	"secret_value_id" uuid,
	"alias" varchar(160) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider" varchar(80) NOT NULL,
	"purpose" varchar(120) NOT NULL,
	"encrypted_value" text NOT NULL,
	"value_hash" varchar(160) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rotation_required" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"last_rotated_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_secret_value_id_secret_values_id_fk" FOREIGN KEY ("secret_value_id") REFERENCES "public"."secret_values"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_values" ADD CONSTRAINT "secret_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_tenant_provider_alias_idx" ON "provider_credentials" USING btree ("tenant_id","provider","alias");--> statement-breakpoint
CREATE INDEX "provider_credentials_provider_type_idx" ON "provider_credentials" USING btree ("provider","credential_type");--> statement-breakpoint
CREATE UNIQUE INDEX "secret_values_tenant_name_idx" ON "secret_values" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "secret_values_provider_purpose_idx" ON "secret_values" USING btree ("provider","purpose");