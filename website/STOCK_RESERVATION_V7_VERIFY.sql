-- ComePlayers V7 verification

SELECT
  id,
  status,
  payment_status,
  reservation_status,
  reservation_expires_at,
  expired_at,
  expiration_reason
FROM public.orders
ORDER BY id DESC
LIMIT 20;

SELECT
  id,
  order_id,
  product_id,
  buyer_id,
  quantity,
  status,
  expires_at,
  consumed_at,
  released_at,
  release_reason
FROM public.product_stock_reservations
ORDER BY id DESC
LIMIT 20;

SELECT id, title, stock, status
FROM public.products
ORDER BY id DESC
LIMIT 20;

SELECT
  id,
  coupon_id,
  order_id,
  status,
  consumed_at,
  released_at
FROM public.coupon_usages
ORDER BY id DESC
LIMIT 20;
