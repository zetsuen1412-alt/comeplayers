SELECT key, mode, percentage, updated_at
FROM public.runtime_controls
WHERE key = 'checkout';

SELECT
  to_regclass('public.paypal_provider_checks') AS paypal_provider_checks,
  to_regclass('public.uptime_checks') AS uptime_checks,
  to_regclass('public.staging_fixture_runs') AS staging_fixture_runs;

SELECT area, status
FROM public.launch_signoffs
WHERE area IN (
  'staging_fixtures',
  'provider_reconciliation',
  'mutation_load_test',
  'slo_monitoring',
  'canary_launch'
)
ORDER BY area;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'runtime_controls',
    'paypal_provider_checks',
    'uptime_checks',
    'staging_fixture_runs'
  )
ORDER BY tablename;
