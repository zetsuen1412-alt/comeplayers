-- ComePlayers V13 verification (read-only)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('products', 'orders', 'product_stock_reservations', 'product_variants')
  AND column_name IN ('has_variants', 'variant_count', 'min_variant_price', 'max_variant_price', 'variant_id', 'variant_name', 'variant_sku')
ORDER BY table_name, ordinal_position;

SELECT
  p.id,
  p.title,
  p.has_variants,
  p.variant_count,
  p.stock AS aggregate_stock,
  p.min_variant_price,
  p.max_variant_price,
  count(v.id) FILTER (WHERE v.status <> 'archived') AS actual_variants,
  COALESCE(sum(v.stock) FILTER (WHERE v.status = 'active'), 0) AS actual_active_stock
FROM public.products p
LEFT JOIN public.product_variants v ON v.product_id = p.id
GROUP BY p.id
ORDER BY p.id DESC
LIMIT 50;

SELECT id, order_id, product_id, variant_id, quantity, status, expires_at
FROM public.product_stock_reservations
ORDER BY id DESC
LIMIT 50;

SELECT id, product_id, variant_id, variant_name, variant_sku, quantity, status, payment_status
FROM public.orders
ORDER BY id DESC
LIMIT 50;
