-- ComePlayers V16 verification (read-only)

SELECT
  'profiles_storefront_columns' AS check_name,
  count(*) AS columns_found
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN (
    'store_slug', 'store_name', 'store_tagline', 'store_description',
    'store_banner_url', 'store_logo_url', 'store_accent_color',
    'store_announcement', 'store_policies', 'store_vacation_mode',
    'store_vacation_message', 'store_reopens_at', 'store_is_published',
    'store_updated_at'
  );

SELECT
  'featured_products_table' AS check_name,
  to_regclass('public.seller_store_featured_products') AS relation_name;

SELECT
  'storefront_rpc' AS check_name,
  count(*) AS functions_found
FROM pg_proc
WHERE proname = 'cp_update_seller_storefront_v16';

SELECT
  id,
  store_slug,
  store_name,
  store_is_published,
  store_vacation_mode,
  store_updated_at
FROM public.profiles
WHERE store_slug IS NOT NULL
ORDER BY store_updated_at DESC NULLS LAST
LIMIT 20;

SELECT
  seller_id,
  product_id,
  sort_order,
  created_at
FROM public.seller_store_featured_products
ORDER BY seller_id, sort_order
LIMIT 50;
