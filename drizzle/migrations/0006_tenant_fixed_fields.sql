CREATE TABLE "tenant_fixed_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" bigint NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL DEFAULT '',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_fixed_fields" ADD CONSTRAINT "tenant_fixed_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_fixed_fields_tenant_key_idx" ON "tenant_fixed_fields" USING btree ("tenant_id","key");
--> statement-breakpoint
CREATE INDEX "tenant_fixed_fields_tenant_idx" ON "tenant_fixed_fields" USING btree ("tenant_id");
