BEGIN;

CREATE TABLE IF NOT EXISTS public.operational_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  source text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  destination text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  cooldown_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_alerts
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS context jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurrence_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_detected_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_detected_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS operational_alerts_fingerprint_idx
  ON public.operational_alerts(fingerprint);
CREATE INDEX IF NOT EXISTS operational_alerts_status_severity_idx
  ON public.operational_alerts(status, severity, last_detected_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'operational_alerts_severity_check'
      AND conrelid = 'public.operational_alerts'::regclass
  ) THEN
    ALTER TABLE public.operational_alerts
      ADD CONSTRAINT operational_alerts_severity_check
      CHECK (severity IN ('info', 'warning', 'high', 'critical')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'operational_alerts_status_check'
      AND conrelid = 'public.operational_alerts'::regclass
  ) THEN
    ALTER TABLE public.operational_alerts
      ADD CONSTRAINT operational_alerts_status_check
      CHECK (status IN ('pending', 'sent', 'failed', 'suppressed', 'acknowledged')) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.operational_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  run_key text NOT NULL,
  source text NOT NULL DEFAULT 'cron',
  status text NOT NULL DEFAULT 'running',
  request_id text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_runs
  ADD COLUMN IF NOT EXISTS job_name text,
  ADD COLUMN IF NOT EXISTS run_key text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'cron',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS summary jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS operational_runs_run_key_idx
  ON public.operational_runs(run_key);
CREATE INDEX IF NOT EXISTS operational_runs_job_started_idx
  ON public.operational_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS operational_runs_status_idx
  ON public.operational_runs(status, started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'operational_runs_status_check'
      AND conrelid = 'public.operational_runs'::regclass
  ) THEN
    ALTER TABLE public.operational_runs
      ADD CONSTRAINT operational_runs_status_check
      CHECK (status IN ('running', 'completed', 'failed')) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id bigserial PRIMARY KEY,
  provider text NOT NULL DEFAULT 'paypal',
  event_id text NOT NULL,
  event_type text NOT NULL,
  verification_status text NOT NULL DEFAULT 'verified',
  processing_status text NOT NULL DEFAULT 'received',
  marketplace_order_id bigint,
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  first_processed_at timestamptz,
  last_processed_at timestamptz,
  replayed_at timestamptz,
  replayed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'paypal',
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS marketplace_order_id bigint,
  ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_headers jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS first_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS replayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS replayed_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_event_idx
  ON public.payment_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS payment_webhook_events_status_received_idx
  ON public.payment_webhook_events(processing_status, received_at DESC);
CREATE INDEX IF NOT EXISTS payment_webhook_events_order_idx
  ON public.payment_webhook_events(marketplace_order_id, received_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_webhook_events_verification_check'
      AND conrelid = 'public.payment_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.payment_webhook_events
      ADD CONSTRAINT payment_webhook_events_verification_check
      CHECK (verification_status IN ('verified', 'failed', 'skipped')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_webhook_events_processing_check'
      AND conrelid = 'public.payment_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.payment_webhook_events
      ADD CONSTRAINT payment_webhook_events_processing_check
      CHECK (processing_status IN ('received', 'processing', 'processed', 'ignored', 'failed')) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.launch_signoffs (
  id bigserial PRIMARY KEY,
  area text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  signed_by uuid,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.launch_signoffs
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS signed_by uuid,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS launch_signoffs_area_idx
  ON public.launch_signoffs(area);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'launch_signoffs_status_check'
      AND conrelid = 'public.launch_signoffs'::regclass
  ) THEN
    ALTER TABLE public.launch_signoffs
      ADD CONSTRAINT launch_signoffs_status_check
      CHECK (status IN ('pending', 'passed', 'blocked')) NOT VALID;
  END IF;
END;
$$;

INSERT INTO public.launch_signoffs(area, status)
VALUES
  ('security_review', 'pending'),
  ('payment_sandbox_validation', 'pending'),
  ('backup_restore_drill', 'pending'),
  ('legal_and_policy_review', 'pending'),
  ('support_and_incident_response', 'pending'),
  ('performance_and_capacity', 'pending'),
  ('final_business_approval', 'pending')
ON CONFLICT (area) DO NOTHING;

ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_signoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_operational_alerts_admin_read ON public.operational_alerts;
CREATE POLICY cp_operational_alerts_admin_read ON public.operational_alerts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(COALESCE(profiles.role, '')) = 'admin'
  )
);

DROP POLICY IF EXISTS cp_operational_runs_admin_read ON public.operational_runs;
CREATE POLICY cp_operational_runs_admin_read ON public.operational_runs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(COALESCE(profiles.role, '')) = 'admin'
  )
);

DROP POLICY IF EXISTS cp_payment_webhook_events_admin_read ON public.payment_webhook_events;
CREATE POLICY cp_payment_webhook_events_admin_read ON public.payment_webhook_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(COALESCE(profiles.role, '')) = 'admin'
  )
);

DROP POLICY IF EXISTS cp_launch_signoffs_admin_read ON public.launch_signoffs;
CREATE POLICY cp_launch_signoffs_admin_read ON public.launch_signoffs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(COALESCE(profiles.role, '')) = 'admin'
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.operational_alerts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.operational_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_webhook_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.launch_signoffs FROM anon, authenticated;

GRANT SELECT ON public.operational_alerts TO authenticated;
GRANT SELECT ON public.operational_runs TO authenticated;
GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT SELECT ON public.launch_signoffs TO authenticated;

COMMIT;

SELECT
  'comeplayers_launch_readiness_v19_ready' AS status,
  (SELECT count(*) FROM public.launch_signoffs) AS signoff_count,
  (SELECT count(*) FROM public.operational_alerts) AS alert_count,
  (SELECT count(*) FROM public.payment_webhook_events) AS webhook_event_count;
