-- Espelho webhook message_template_status_update (RLS + Realtime)
-- Idempotente: pode reexecutar sem erro.

CREATE TABLE IF NOT EXISTS public.waba_template_status_snapshots (
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  meta_template_id text NOT NULL,
  template_name text NOT NULL,
  language text NOT NULL DEFAULT '',
  category text,
  status text NOT NULL,
  reason text,
  rejection_info jsonb,
  disable_info jsonb,
  other_info jsonb,
  webhook_time timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, meta_template_id)
);

CREATE INDEX IF NOT EXISTS waba_template_status_snapshots_tenant_idx
  ON public.waba_template_status_snapshots (tenant_id);

ALTER TABLE public.waba_template_status_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waba_template_status_snapshots_select ON public.waba_template_status_snapshots;

CREATE POLICY waba_template_status_snapshots_select ON public.waba_template_status_snapshots
  FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

-- Escrita apenas via service role / servidor (sem política INSERT/UPDATE para authenticated)

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
