BEGIN;

ALTER TABLE public.game_master
  ADD COLUMN IF NOT EXISTS igdb_id bigint,
  ADD COLUMN IF NOT EXISTS rawg_id bigint,
  ADD COLUMN IF NOT EXISTS provider_source text,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS provider_slug text,
  ADD COLUMN IF NOT EXISTS provider_summary text,
  ADD COLUMN IF NOT EXISTS provider_cover_url text,
  ADD COLUMN IF NOT EXISTS provider_background_url text,
  ADD COLUMN IF NOT EXISTS provider_release_date date,
  ADD COLUMN IF NOT EXISTS provider_rating numeric(8,4),
  ADD COLUMN IF NOT EXISTS provider_checksum text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS local_override_fields text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_master_sync_status_check'
      AND conrelid = 'public.game_master'::regclass
  ) THEN
    ALTER TABLE public.game_master
      ADD CONSTRAINT game_master_sync_status_check
      CHECK (sync_status IN ('manual', 'imported', 'matched', 'needs_review', 'rejected', 'error'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS game_master_igdb_id_unique
  ON public.game_master (igdb_id)
  WHERE igdb_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS game_master_rawg_id_idx
  ON public.game_master (rawg_id)
  WHERE rawg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS game_master_sync_status_idx
  ON public.game_master (sync_status, last_synced_at);

CREATE TABLE IF NOT EXISTS public.igdb_sync_runs (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  requested_limit integer NOT NULL DEFAULT 0,
  fetched_count integer NOT NULL DEFAULT 0,
  staged_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT igdb_sync_runs_action_check
    CHECK (action IN ('stage', 'apply', 'sync')),
  CONSTRAINT igdb_sync_runs_status_check
    CHECK (status IN ('running', 'completed', 'failed')),
  CONSTRAINT igdb_sync_runs_counts_check
    CHECK (
      requested_limit >= 0 AND
      fetched_count >= 0 AND
      staged_count >= 0 AND
      matched_count >= 0 AND
      imported_count >= 0 AND
      failed_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS igdb_sync_runs_created_idx
  ON public.igdb_sync_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.igdb_import_candidates (
  id bigserial PRIMARY KEY,
  igdb_id bigint NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  proposed_name text NOT NULL,
  proposed_slug text NOT NULL,
  proposed_summary text,
  proposed_cover_url text,
  proposed_background_url text,
  proposed_release_date date,
  proposed_rating numeric(8,4),
  proposed_genres jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_platforms jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_game_id bigint REFERENCES public.game_master(id) ON DELETE SET NULL,
  match_score numeric(6,2) NOT NULL DEFAULT 0,
  match_reason text,
  provider_checksum text,
  provider_updated_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  imported_game_id bigint REFERENCES public.game_master(id) ON DELETE SET NULL,
  imported_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT igdb_import_candidates_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'imported', 'error')),
  CONSTRAINT igdb_import_candidates_score_check
    CHECK (match_score >= 0 AND match_score <= 100)
);

CREATE INDEX IF NOT EXISTS igdb_import_candidates_status_idx
  ON public.igdb_import_candidates (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS igdb_import_candidates_match_idx
  ON public.igdb_import_candidates (match_game_id)
  WHERE match_game_id IS NOT NULL;

ALTER TABLE public.igdb_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.igdb_import_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS igdb_sync_runs_admin_select ON public.igdb_sync_runs;
CREATE POLICY igdb_sync_runs_admin_select
  ON public.igdb_sync_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND lower(trim(COALESCE(profiles.role, ''))) = 'admin'
    )
  );

DROP POLICY IF EXISTS igdb_candidates_admin_select ON public.igdb_import_candidates;
CREATE POLICY igdb_candidates_admin_select
  ON public.igdb_import_candidates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND lower(trim(COALESCE(profiles.role, ''))) = 'admin'
    )
  );

REVOKE ALL ON public.igdb_sync_runs FROM anon;
REVOKE ALL ON public.igdb_import_candidates FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.igdb_sync_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.igdb_import_candidates FROM authenticated;

GRANT SELECT ON public.igdb_sync_runs TO authenticated;
GRANT SELECT ON public.igdb_import_candidates TO authenticated;
GRANT ALL ON public.igdb_sync_runs TO service_role;
GRANT ALL ON public.igdb_import_candidates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.igdb_sync_runs_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.igdb_import_candidates_id_seq TO service_role;

COMMENT ON COLUMN public.game_master.local_override_fields IS
  'Live fields intentionally controlled by ComePlayers admin and never overwritten by provider sync.';
COMMENT ON COLUMN public.game_master.provider_payload IS
  'Latest raw IGDB payload for audit and future remapping; not served directly to clients.';
COMMENT ON TABLE public.igdb_import_candidates IS
  'Staging review queue. IGDB records must be approved before they are linked or inserted into game_master.';

COMMIT;

SELECT 'comeplayers_igdb_catalog_v23_2_ready' AS status;
