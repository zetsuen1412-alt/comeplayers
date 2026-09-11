-- ComePlayers V23.7 verification. Read-only.

SELECT
  to_regclass('public.seller_catalog_imports') AS seller_catalog_imports;

SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.seller_catalog_imports'::regclass
ORDER BY conname;

SELECT
  policyname,
  cmd,
  roles,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'seller_catalog_imports'
ORDER BY policyname;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'seller_catalog_imports'
ORDER BY indexname;

SELECT 'comeplayers_bulk_import_history_v23_7_verified' AS status;
