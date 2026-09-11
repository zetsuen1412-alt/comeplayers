SELECT
  to_regclass('public.game_master') AS game_master,
  to_regclass('public.igdb_sync_runs') AS igdb_sync_runs,
  to_regclass('public.igdb_import_candidates') AS igdb_import_candidates;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'game_master'
  AND column_name IN (
    'igdb_id',
    'rawg_id',
    'provider_source',
    'provider_payload',
    'provider_updated_at',
    'last_synced_at',
    'last_sync_error',
    'sync_status',
    'local_override_fields'
  )
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'game_master'
  AND indexname IN (
    'game_master_igdb_id_unique',
    'game_master_rawg_id_idx',
    'game_master_sync_status_idx'
  )
ORDER BY indexname;

SELECT
  COALESCE(source, 'unknown') AS source,
  sync_status,
  COUNT(*) AS total
FROM public.game_master
GROUP BY source, sync_status
ORDER BY total DESC;

SELECT status, COUNT(*) AS total
FROM public.igdb_import_candidates
GROUP BY status
ORDER BY status;

SELECT action, status, requested_limit, fetched_count, staged_count,
       matched_count, imported_count, failed_count, started_at, finished_at
FROM public.igdb_sync_runs
ORDER BY id DESC
LIMIT 10;
