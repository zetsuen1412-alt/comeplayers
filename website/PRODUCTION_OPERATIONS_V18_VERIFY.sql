SELECT
  to_regclass('public.reconciliation_runs') AS reconciliation_runs,
  to_regclass('public.reconciliation_issues') AS reconciliation_issues;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('reconciliation_runs', 'reconciliation_issues')
ORDER BY table_name, ordinal_position;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reconciliation_runs', 'reconciliation_issues')
ORDER BY tablename, policyname;
