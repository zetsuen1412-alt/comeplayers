-- ComePlayers Security Boundary V6 verification

SELECT
  'tables' AS check_name,
  to_regclass('public.order_delivery_vaults') AS vault_table,
  to_regclass('public.order_delivery_access_logs') AS access_log_table;

SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN (
  'orders',
  'wallets',
  'wallet_transactions',
  'wallet_topups',
  'paypal_transactions',
  'order_delivery_vaults',
  'order_delivery_access_logs'
)
ORDER BY relname;

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'orders',
    'wallets',
    'wallet_transactions',
    'wallet_topups',
    'paypal_transactions'
  )
ORDER BY tablename, policyname;

SELECT
  count(*) FILTER (
    WHERE delivery_message IS NOT NULL OR delivery_credentials IS NOT NULL
  ) AS legacy_plaintext_delivery_rows,
  (SELECT count(*) FROM public.order_delivery_vaults) AS encrypted_delivery_rows,
  (SELECT count(*) FROM public.order_delivery_access_logs) AS delivery_access_events
FROM public.orders;
