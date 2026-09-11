-- ComePlayers V9 verification (read-only)

SELECT to_regclass('public.disputes') AS disputes_table,
       to_regclass('public.dispute_messages') AS dispute_messages_table,
       to_regclass('public.dispute_evidence') AS dispute_evidence_table,
       to_regclass('public.dispute_events') AS dispute_events_table;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'disputes'
  AND column_name IN (
    'category',
    'requested_resolution',
    'priority',
    'response_due_at',
    'last_activity_at',
    'updated_at',
    'buyer_last_read_at',
    'seller_last_read_at',
    'closed_at'
  )
ORDER BY column_name;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'cp_open_dispute_v9';

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'dispute-evidence';

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'disputes',
    'dispute_messages',
    'dispute_evidence',
    'dispute_events'
  )
ORDER BY tablename, policyname;

SELECT
  (SELECT count(*) FROM public.disputes) AS disputes_count,
  (SELECT count(*) FROM public.dispute_messages) AS messages_count,
  (SELECT count(*) FROM public.dispute_evidence) AS evidence_count,
  (SELECT count(*) FROM public.dispute_events) AS events_count;
