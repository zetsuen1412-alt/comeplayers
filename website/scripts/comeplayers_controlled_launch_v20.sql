-- ComePlayers V20
-- Controlled checkout rollout, provider reconciliation, uptime/SLO evidence,
-- and deterministic staging fixture metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS public.runtime_controls (
  key text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'enabled',
  percentage integer NOT NULL DEFAULT 100,
  message text,
  allowlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.runtime_controls
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS percentage integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS allowlist jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'runtime_controls_mode_check'
      AND conrelid = 'public.runtime_controls'::regclass
  ) THEN
    ALTER TABLE public.runtime_controls
      ADD CONSTRAINT runtime_controls_mode_check
      CHECK (mode IN ('enabled', 'disabled', 'canary')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'runtime_controls_percentage_check'
      AND conrelid = 'public.runtime_controls'::regclass
  ) THEN
    ALTER TABLE public.runtime_controls
      ADD CONSTRAINT runtime_controls_percentage_check
      CHECK (percentage BETWEEN 0 AND 100) NOT VALID;
  END IF;
END;
$$;

INSERT INTO public.runtime_controls(key, mode, percentage, message, metadata)
VALUES (
  'checkout',
  'enabled',
  100,
  'Checkout is temporarily unavailable while we perform maintenance.',
  '{"introduced_in":"v20"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.paypal_provider_checks (
  id bigserial PRIMARY KEY,
  capture_id text NOT NULL,
  paypal_transaction_id bigint,
  marketplace_order_id bigint,
  status text NOT NULL,
  severity text NOT NULL,
  mismatches jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  source text NOT NULL DEFAULT 'cron',
  request_id text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paypal_provider_checks
  ADD COLUMN IF NOT EXISTS paypal_transaction_id bigint,
  ADD COLUMN IF NOT EXISTS marketplace_order_id bigint,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS mismatches jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_summary jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'cron',
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS paypal_provider_checks_capture_idx
  ON public.paypal_provider_checks(capture_id);
CREATE INDEX IF NOT EXISTS paypal_provider_checks_status_checked_idx
  ON public.paypal_provider_checks(status, checked_at DESC);
CREATE INDEX IF NOT EXISTS paypal_provider_checks_order_idx
  ON public.paypal_provider_checks(marketplace_order_id, checked_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'paypal_provider_checks_status_check'
      AND conrelid = 'public.paypal_provider_checks'::regclass
  ) THEN
    ALTER TABLE public.paypal_provider_checks
      ADD CONSTRAINT paypal_provider_checks_status_check
      CHECK (status IN ('matched', 'mismatch', 'error')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'paypal_provider_checks_severity_check'
      AND conrelid = 'public.paypal_provider_checks'::regclass
  ) THEN
    ALTER TABLE public.paypal_provider_checks
      ADD CONSTRAINT paypal_provider_checks_severity_check
      CHECK (severity IN ('info', 'high', 'critical')) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.uptime_checks (
  id bigserial PRIMARY KEY,
  target text NOT NULL,
  region text NOT NULL,
  status text NOT NULL,
  http_status integer,
  latency_ms integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.uptime_checks
  ADD COLUMN IF NOT EXISTS target text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS latency_ms integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS uptime_checks_checked_idx
  ON public.uptime_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS uptime_checks_target_region_idx
  ON public.uptime_checks(target, region, checked_at DESC);
CREATE INDEX IF NOT EXISTS uptime_checks_status_idx
  ON public.uptime_checks(status, checked_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uptime_checks_status_check'
      AND conrelid = 'public.uptime_checks'::regclass
  ) THEN
    ALTER TABLE public.uptime_checks
      ADD CONSTRAINT uptime_checks_status_check
      CHECK (status IN ('up', 'down')) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.staging_fixture_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_key text NOT NULL,
  environment text NOT NULL DEFAULT 'staging',
  status text NOT NULL DEFAULT 'running',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staging_fixture_runs_key_idx
  ON public.staging_fixture_runs(fixture_key, started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staging_fixture_runs_status_check'
      AND conrelid = 'public.staging_fixture_runs'::regclass
  ) THEN
    ALTER TABLE public.staging_fixture_runs
      ADD CONSTRAINT staging_fixture_runs_status_check
      CHECK (status IN ('running', 'completed', 'failed', 'cleaned')) NOT VALID;
  END IF;
END;
$$;

INSERT INTO public.launch_signoffs(area, status)
VALUES
  ('staging_fixtures', 'pending'),
  ('provider_reconciliation', 'pending'),
  ('mutation_load_test', 'pending'),
  ('slo_monitoring', 'pending'),
  ('canary_launch', 'pending')
ON CONFLICT (area) DO NOTHING;

ALTER TABLE public.runtime_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_provider_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_fixture_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_runtime_controls_admin_read ON public.runtime_controls;
CREATE POLICY cp_runtime_controls_admin_read ON public.runtime_controls
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(COALESCE(p.role, '')) = 'admin'
    )
  );

DROP POLICY IF EXISTS cp_paypal_provider_checks_admin_read ON public.paypal_provider_checks;
CREATE POLICY cp_paypal_provider_checks_admin_read ON public.paypal_provider_checks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(COALESCE(p.role, '')) = 'admin'
    )
  );

DROP POLICY IF EXISTS cp_uptime_checks_admin_read ON public.uptime_checks;
CREATE POLICY cp_uptime_checks_admin_read ON public.uptime_checks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(COALESCE(p.role, '')) = 'admin'
    )
  );

DROP POLICY IF EXISTS cp_staging_fixture_runs_admin_read ON public.staging_fixture_runs;
CREATE POLICY cp_staging_fixture_runs_admin_read ON public.staging_fixture_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(COALESCE(p.role, '')) = 'admin'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.runtime_controls FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.paypal_provider_checks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.uptime_checks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.staging_fixture_runs FROM anon, authenticated;

GRANT SELECT ON public.runtime_controls TO authenticated;
GRANT SELECT ON public.paypal_provider_checks TO authenticated;
GRANT SELECT ON public.uptime_checks TO authenticated;
GRANT SELECT ON public.staging_fixture_runs TO authenticated;

COMMIT;
