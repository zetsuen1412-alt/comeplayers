-- ComePlayers V14 verification queries

SELECT
  id,
  title,
  game_name,
  category,
  offer_region,
  offer_platform,
  offer_server,
  offer_tags,
  min_variant_price,
  max_variant_price,
  stock,
  search_document IS NOT NULL AS search_ready
FROM public.products
ORDER BY id DESC
LIMIT 25;

SELECT
  seller_service_level,
  count(*) AS sellers,
  round(avg(COALESCE(seller_rating, 0))::numeric, 2) AS avg_rating,
  round(avg(COALESCE(seller_on_time_rate, 0))::numeric, 2) AS avg_on_time_rate
FROM public.profiles
WHERE seller_status = 'approved'
GROUP BY seller_service_level
ORDER BY seller_service_level;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%v14%'
ORDER BY indexname;
