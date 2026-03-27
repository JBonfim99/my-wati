CREATE TYPE "public"."contact_field_type" AS ENUM('text', 'number', 'boolean', 'date', 'select');
CREATE TABLE "contact_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" "contact_field_type" NOT NULL,
	"config" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "contact_tags" (
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "contact_tags_contact_id_tag_id_pk" PRIMARY KEY("contact_id","tag_id")
);
CREATE TABLE "contact_custom_values" (
	"contact_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_custom_values_contact_id_field_id_pk" PRIMARY KEY("contact_id","field_id")
);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
UPDATE "contacts" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
ALTER TABLE "contact_custom_field_definitions" ADD CONSTRAINT "contact_custom_field_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contact_custom_values" ADD CONSTRAINT "contact_custom_values_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contact_custom_values" ADD CONSTRAINT "contact_custom_values_field_id_contact_custom_field_definitions_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."contact_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX IF NOT EXISTS "ccfdef_tenant_key" ON "contact_custom_field_definitions" USING btree ("tenant_id","key");
CREATE INDEX IF NOT EXISTS "ccv_field_idx" ON "contact_custom_values" USING btree ("field_id");
CREATE INDEX IF NOT EXISTS "contact_tags_tag_idx" ON "contact_tags" USING btree ("tag_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tags_tenant_slug" ON "tags" USING btree ("tenant_id","slug");
