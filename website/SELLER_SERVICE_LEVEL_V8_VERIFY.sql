-- ComePlayers V8 verification queries.
-- Run after scripts/comeplayers_seller_service_levels_v8.sql.

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN (
    'seller_presence_mode',
    'seller_last_seen_at',
    'seller_delivery_sla_minutes',
    'seller_avg_delivery_minutes',
    'seller_on_time_rate',
    'seller_total_deliveries',
    'seller_late_deliveries',
    'seller_service_level'
  )
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN (
    'delivery_sla_minutes',
    'delivery_due_at',
    'delivery_late_at',
    'delivery_sla_status',
    'seller_service_level_snapshot'
  )
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name = 'delivery_eta_minutes';

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'cp_calculate_seller_service_level',
    'cp_refresh_seller_delivery_metrics',
    'cp_apply_order_delivery_sla',
    'cp_mark_late_delivery_orders'
  )
ORDER BY routine_name;

SELECT
  id,
  seller_name,
  seller_presence_mode,
  seller_delivery_sla_minutes,
  seller_avg_delivery_minutes,
  seller_on_time_rate,
  seller_total_deliveries,
  seller_late_deliveries,
  seller_service_level
FROM public.profiles
WHERE seller_status = 'approved'
ORDER BY seller_total_deliveries DESC NULLS LAST
LIMIT 25;

SELECT
  id,
  seller_id,
  payment_status,
  status,
  paid_at,
  delivered_at,
  delivery_sla_minutes,
  delivery_due_at,
  delivery_sla_status,
  seller_service_level_snapshot
FROM public.orders
WHERE delivery_due_at IS NOT NULL
ORDER BY id DESC
LIMIT 50;
