CREATE TABLE IF NOT EXISTS "message_template_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" bigint NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "created_by" uuid REFERENCES "profiles"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "message_template_drafts_tenant_idx"
  ON "message_template_drafts" ("tenant_id");
