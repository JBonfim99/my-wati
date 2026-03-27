-- Igual a supabase/migrations/20260402120000_waba_template_status_snapshots.sql (idempotente).

CREATE TABLE IF NOT EXISTS "waba_template_status_snapshots" (
	"tenant_id" bigint NOT NULL,
	"meta_template_id" text NOT NULL,
	"template_name" text NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"category" text,
	"status" text NOT NULL,
	"reason" text,
	"rejection_info" jsonb,
	"disable_info" jsonb,
	"other_info" jsonb,
	"webhook_time" timestamptz NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "waba_template_status_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "waba_template_status_snapshots_tenant_id_meta_template_id_pk" PRIMARY KEY("tenant_id","meta_template_id")
);
CREATE INDEX IF NOT EXISTS "waba_template_status_snapshots_tenant_idx" ON "waba_template_status_snapshots" USING btree ("tenant_id");

ALTER TABLE public.waba_template_status_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waba_template_status_snapshots_select ON public.waba_template_status_snapshots;

CREATE POLICY waba_template_status_snapshots_select ON public.waba_template_status_snapshots
  FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'waba_template_status_snapshots'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.waba_template_status_snapshots;
    END IF;
  END IF;
END $$;
