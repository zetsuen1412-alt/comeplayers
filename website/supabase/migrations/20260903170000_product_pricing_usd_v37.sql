BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seller_price_currency text,
  ADD COLUMN IF NOT EXISTS seller_price_amount numeric;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS seller_price_currency text,
  ADD COLUMN IF NOT EXISTS seller_price_amount numeric;

UPDATE public.products
SET
  seller_price_currency = COALESCE(NULLIF(seller_price_currency, ''), 'IDR'),
  seller_price_amount = COALESCE(
    seller_price_amount,
    NULLIF(regexp_replace(COALESCE(price, ''), '[^0-9.]', '', 'g'), '')::numeric
  )
WHERE seller_price_currency IS NULL OR seller_price_amount IS NULL;

UPDATE public.product_variants
SET
  seller_price_currency = COALESCE(NULLIF(seller_price_currency, ''), 'IDR'),
  seller_price_amount = COALESCE(seller_price_amount, price)
WHERE seller_price_currency IS NULL OR seller_price_amount IS NULL;

-- Preserve every seller-entered legacy value, then change only the marketplace
-- canonical price. The rate is the 2026-09-03 reference used for this one-time
-- migration; future imports and checkouts use the server-side live rate.
UPDATE public.products
SET price = ROUND(
  NULLIF(regexp_replace(COALESCE(price, ''), '[^0-9.]', '', 'g'), '')::numeric
  / 17742,
  4
)::text
WHERE COALESCE(seller_price_currency, 'IDR') = 'IDR';

UPDATE public.product_variants
SET price = ROUND(price / 17742, 4)
WHERE COALESCE(seller_price_currency, 'IDR') = 'IDR';

ALTER TABLE public.products
  ALTER COLUMN seller_price_currency SET DEFAULT 'USD',
  ALTER COLUMN seller_price_currency SET NOT NULL,
  ALTER COLUMN seller_price_amount SET NOT NULL;

ALTER TABLE public.product_variants
  ALTER COLUMN seller_price_currency SET DEFAULT 'USD',
  ALTER COLUMN seller_price_currency SET NOT NULL,
  ALTER COLUMN seller_price_amount SET NOT NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_seller_price_currency_check,
  ADD CONSTRAINT products_seller_price_currency_check
  CHECK (seller_price_currency IN ('IDR','USD','EUR','GBP','SGD','MYR','PHP','THB','VND','JPY','KRW','AUD','CAD'));

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_seller_price_currency_check,
  ADD CONSTRAINT product_variants_seller_price_currency_check
  CHECK (seller_price_currency IN ('IDR','USD','EUR','GBP','SGD','MYR','PHP','THB','VND','JPY','KRW','AUD','CAD'));

COMMENT ON COLUMN public.products.price IS
  'Canonical marketplace product price in USD. Seller-entered amount and currency are stored separately.';
COMMENT ON COLUMN public.products.seller_price_currency IS
  'Currency selected by the seller for the original listing amount.';
COMMENT ON COLUMN public.products.seller_price_amount IS
  'Original listing amount entered by the seller.';

CREATE OR REPLACE FUNCTION public.create_marketplace_order_usd_v1(
  p_buyer_id uuid,
  p_product_id bigint,
  p_variant_id bigint DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_payment_method text DEFAULT 'wallet',
  p_coupon_code text DEFAULT NULL,
  p_payment_fee_rate numeric DEFAULT 0,
  p_reservation_minutes integer DEFAULT 20,
  p_idr_per_usd numeric DEFAULT 17742
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_variant record;
  v_coupon record;
  v_order_id bigint;
  v_quantity integer;
  v_unit_price_usd numeric;
  v_unit_price numeric;
  v_available_stock integer;
  v_subtotal numeric;
  v_discount numeric := 0;
  v_fee_rate numeric;
  v_payment_fee numeric := 0;
  v_total numeric;
  v_coupon_code text;
  v_coupon_id bigint := NULL;
  v_expires_at timestamptz;
  v_variant_name text := NULL;
  v_variant_sku text := NULL;
  v_idr_per_usd numeric;
BEGIN
  IF p_buyer_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  PERFORM public.cp_release_expired_stock_reservations(200);

  v_quantity := GREATEST(1, LEAST(COALESCE(p_quantity, 1), 100));
  v_expires_at := now() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_reservation_minutes, 20), 60)));
  v_idr_per_usd := COALESCE(p_idr_per_usd, 0);
  IF v_idr_per_usd < 1000 OR v_idr_per_usd > 100000 THEN
    RAISE EXCEPTION 'Product price could not be prepared.';
  END IF;

  IF lower(COALESCE(p_payment_method, '')) NOT IN ('wallet', 'paypal') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  SELECT id, title, price, seller_id, seller_name, seller, game_name, category,
         stock, status, has_variants
  INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;
  IF lower(COALESCE(v_product.status, 'active')) <> 'active' THEN RAISE EXCEPTION 'Product is inactive.'; END IF;
  IF v_product.seller_id IS NULL THEN RAISE EXCEPTION 'Product seller ID is missing.'; END IF;
  IF v_product.seller_id = p_buyer_id THEN RAISE EXCEPTION 'You cannot buy your own product.'; END IF;

  IF COALESCE(v_product.has_variants, false) THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'Please select a product variant.'; END IF;
    SELECT id, product_id, seller_id, sku, name, price, stock, status
    INTO v_variant
    FROM public.product_variants
    WHERE id = p_variant_id AND product_id = p_product_id
    FOR UPDATE;
    IF NOT FOUND OR lower(COALESCE(v_variant.status, '')) <> 'active' THEN
      RAISE EXCEPTION 'Product variant is not available.';
    END IF;
    IF v_variant.seller_id IS DISTINCT FROM v_product.seller_id THEN
      RAISE EXCEPTION 'Product variant seller mismatch.';
    END IF;
    v_unit_price_usd := v_variant.price;
    v_available_stock := COALESCE(v_variant.stock, 0);
    v_variant_name := v_variant.name;
    v_variant_sku := v_variant.sku;
  ELSE
    IF p_variant_id IS NOT NULL THEN RAISE EXCEPTION 'This product does not use variants.'; END IF;
    v_unit_price_usd := public.cp_to_numeric(v_product.price::text);
    v_available_stock := COALESCE(v_product.stock, 0);
  END IF;

  IF v_available_stock < v_quantity THEN RAISE EXCEPTION 'Product stock is insufficient.'; END IF;
  IF v_unit_price_usd <= 0 THEN RAISE EXCEPTION 'Product price is invalid.'; END IF;
  v_unit_price := CEIL(v_unit_price_usd * v_idr_per_usd);
  v_subtotal := v_unit_price * v_quantity;
  v_coupon_code := NULLIF(upper(btrim(COALESCE(p_coupon_code, ''))), '');

  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE upper(code) = v_coupon_code AND lower(COALESCE(status, 'inactive')) = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found or inactive.'; END IF;
    IF v_coupon.start_at IS NOT NULL AND now() < v_coupon.start_at THEN RAISE EXCEPTION 'Coupon is not active yet.'; END IF;
    IF v_coupon.end_at IS NOT NULL AND now() > v_coupon.end_at THEN RAISE EXCEPTION 'Coupon has expired.'; END IF;
    IF v_coupon.usage_limit IS NOT NULL AND COALESCE(v_coupon.used_count, 0) >= v_coupon.usage_limit THEN
      RAISE EXCEPTION 'Coupon usage limit has been reached.';
    END IF;
    IF v_subtotal < public.cp_to_numeric(v_coupon.minimum_order_amount::text) THEN
      RAISE EXCEPTION 'Order does not meet the coupon minimum amount.';
    END IF;
    IF lower(COALESCE(v_coupon.discount_type, 'fixed')) = 'percent' THEN
      v_discount := v_subtotal * public.cp_to_numeric(v_coupon.discount_value::text) / 100;
      IF v_coupon.maximum_discount_amount IS NOT NULL THEN
        v_discount := LEAST(v_discount, public.cp_to_numeric(v_coupon.maximum_discount_amount::text));
      END IF;
    ELSE
      v_discount := public.cp_to_numeric(v_coupon.discount_value::text);
    END IF;
    v_discount := LEAST(v_subtotal, GREATEST(0, v_discount));
    v_coupon_id := v_coupon.id;
  END IF;

  v_fee_rate := LEAST(0.2, GREATEST(0, COALESCE(p_payment_fee_rate, 0)));
  IF lower(p_payment_method) = 'paypal' THEN
    v_payment_fee := ceil(GREATEST(0, v_subtotal - v_discount) * v_fee_rate);
  END IF;
  v_total := GREATEST(0, v_subtotal - v_discount + v_payment_fee);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Order total is invalid.'; END IF;

  IF p_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity), updated_at = now()
    WHERE id = p_variant_id;
  ELSE
    UPDATE public.products
    SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity), updated_at = now()
    WHERE id = v_product.id;
  END IF;

  INSERT INTO public.orders (
    buyer_id, seller_id, product_id, variant_id, variant_name, variant_sku, quantity,
    subtotal_amount, discount_amount, payment_fee_amount, total_price, total_amount, price,
    status, payment_status, payment_method, product_title, seller_name, game_name, category,
    coupon_id, coupon_code, currency_code, escrow_status, reservation_status,
    reservation_expires_at, created_at, updated_at
  ) VALUES (
    p_buyer_id, v_product.seller_id, v_product.id, p_variant_id,
    v_variant_name, v_variant_sku, v_quantity,
    v_subtotal, v_discount, v_payment_fee, v_total, v_total, v_total::text,
    'pending_payment', 'unpaid', lower(p_payment_method), v_product.title,
    COALESCE(v_product.seller_name, v_product.seller, 'Seller'), v_product.game_name, v_product.category,
    v_coupon_id, v_coupon_code, 'IDR', 'pending', 'active', v_expires_at, now(), now()
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.product_stock_reservations (
    order_id, product_id, variant_id, buyer_id, quantity, status, expires_at, created_at, updated_at
  ) VALUES (
    v_order_id, v_product.id, p_variant_id, p_buyer_id, v_quantity, 'active', v_expires_at, now(), now()
  );

  IF v_coupon_code IS NOT NULL THEN
    UPDATE public.coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE id = v_coupon_id;
    INSERT INTO public.coupon_usages (
      coupon_id, user_id, order_id, original_amount, discount_amount, final_amount, status, created_at
    ) VALUES (
      v_coupon_id, p_buyer_id, v_order_id, v_subtotal, v_discount, v_total, 'reserved', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'product_id', v_product.id,
    'variant_id', p_variant_id,
    'variant_name', v_variant_name,
    'unit_price', v_unit_price,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'payment_fee', v_payment_fee,
    'total', v_total,
    'payment_method', lower(p_payment_method),
    'coupon_code', v_coupon_code,
    'reservation_status', 'active',
    'reservation_expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_marketplace_order_doku_usd_v1(
  p_buyer_id uuid,
  p_product_id bigint,
  p_variant_id bigint DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_coupon_code text DEFAULT NULL,
  p_reservation_minutes integer DEFAULT 55,
  p_idr_per_usd numeric DEFAULT 17742
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_order_id bigint;
BEGIN
  v_result := public.create_marketplace_order_usd_v1(
    p_buyer_id, p_product_id, p_variant_id, p_quantity, 'wallet',
    p_coupon_code, 0, p_reservation_minutes, p_idr_per_usd
  );
  v_order_id := NULLIF(v_result ->> 'id', '')::bigint;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'DOKU order was created without an identifier.';
  END IF;
  UPDATE public.orders
  SET payment_method = 'doku', updated_at = now()
  WHERE id = v_order_id AND buyer_id = p_buyer_id;
  RETURN jsonb_set(v_result, '{payment_method}', to_jsonb('doku'::text), true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order_usd_v1(
  uuid, bigint, bigint, integer, text, text, numeric, integer, numeric
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_marketplace_order_doku_usd_v1(
  uuid, bigint, bigint, integer, text, integer, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_usd_v1(
  uuid, bigint, bigint, integer, text, text, numeric, integer, numeric
) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_doku_usd_v1(
  uuid, bigint, bigint, integer, text, integer, numeric
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_marketplace_order_v13(
  uuid, bigint, bigint, integer, text, text, numeric, integer
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.create_marketplace_order_doku_v1(
  uuid, bigint, bigint, integer, text, integer
) FROM service_role;

DO $$
DECLARE v_product_id bigint;
BEGIN
  FOR v_product_id IN SELECT DISTINCT product_id FROM public.product_variants LOOP
    PERFORM public.cp_sync_product_variant_summary(v_product_id);
  END LOOP;
END;
$$;

COMMIT;
