BEGIN;

CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  source text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'running',
  request_key text NOT NULL,
  initiated_by uuid,
  window_started_at timestamptz NOT NULL,
  window_ended_at timestamptz NOT NULL,
  scanned_count integer NOT NULL DEFAULT 0,
  issue_count integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_runs
  ADD COLUMN IF NOT EXISTS scope_key text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS request_key text,
  ADD COLUMN IF NOT EXISTS initiated_by uuid,
  ADD COLUMN IF NOT EXISTS window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS window_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS scanned_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issue_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_runs_request_key_idx
  ON public.reconciliation_runs(request_key);
CREATE INDEX IF NOT EXISTS reconciliation_runs_scope_started_idx
  ON public.reconciliation_runs(scope_key, started_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_runs_status_idx
  ON public.reconciliation_runs(status, started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_runs_status_check'
      AND conrelid = 'public.reconciliation_runs'::regclass
  ) THEN
    ALTER TABLE public.reconciliation_runs
      ADD CONSTRAINT reconciliation_runs_status_check
      CHECK (status IN ('running', 'completed', 'failed')) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.reconciliation_issues (
  id bigserial PRIMARY KEY,
  scope_key text NOT NULL,
  issue_key text NOT NULL,
  issue_type text NOT NULL,
  severity text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  last_run_id uuid REFERENCES public.reconciliation_runs(id) ON DELETE SET NULL,
  occurrence_count integer NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_issues
  ADD COLUMN IF NOT EXISTS scope_key text,
  ADD COLUMN IF NOT EXISTS issue_key text,
  ADD COLUMN IF NOT EXISTS issue_type text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS expected jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS actual jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS first_detected_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_detected_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_run_id uuid,
  ADD COLUMN IF NOT EXISTS occurrence_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_issues_scope_key_idx
  ON public.reconciliation_issues(scope_key, issue_key);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_issues_last_run_id_fkey'
      AND conrelid = 'public.reconciliation_issues'::regclass
  ) THEN
    ALTER TABLE public.reconciliation_issues
      ADD CONSTRAINT reconciliation_issues_last_run_id_fkey
      FOREIGN KEY (last_run_id)
      REFERENCES public.reconciliation_runs(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS reconciliation_issues_status_severity_idx
  ON public.reconciliation_issues(status, severity, last_detected_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_issues_entity_idx
  ON public.reconciliation_issues(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS reconciliation_issues_run_idx
  ON public.reconciliation_issues(last_run_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_issues_status_check'
      AND conrelid = 'public.reconciliation_issues'::regclass
  ) THEN
    ALTER TABLE public.reconciliation_issues
      ADD CONSTRAINT reconciliation_issues_status_check
      CHECK (status IN ('open', 'resolved', 'ignored')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_issues_severity_check'
      AND conrelid = 'public.reconciliation_issues'::regclass
  ) THEN
    ALTER TABLE public.reconciliation_issues
      ADD CONSTRAINT reconciliation_issues_severity_check
      CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_reconciliation_runs_admin_read ON public.reconciliation_runs;
CREATE POLICY cp_reconciliation_runs_admin_read
ON public.reconciliation_runs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(COALESCE(profiles.role, '')) = 'admin'
  )
);

DROP POLICY IF EXISTS cp_reconciliation_issues_admin_read ON public.reconciliation_issues;
CREATE POLICY cp_reconciliation_issues_admin_read
ON public.reconciliation_issues
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(COALESCE(profiles.role, '')) = 'admin'
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.reconciliation_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reconciliation_issues FROM anon, authenticated;
GRANT SELECT ON public.reconciliation_runs TO authenticated;
GRANT SELECT ON public.reconciliation_issues TO authenticated;

COMMIT;

SELECT
  'comeplayers_production_operations_v18_ready' AS status,
  (SELECT count(*) FROM public.reconciliation_runs) AS reconciliation_runs_count,
  (SELECT count(*) FROM public.reconciliation_issues) AS reconciliation_issues_count;
