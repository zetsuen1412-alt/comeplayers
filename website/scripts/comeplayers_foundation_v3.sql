-- ComePlayers Foundation V3
-- Server-authoritative checkout, coupon accounting, and marketplace hardening.
-- Run after comeplayers_transaction_core_v2_1.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.cp_to_numeric(value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN 0;
  END IF;

  cleaned := regexp_replace(value, '[^0-9]', '', 'g');

  IF cleaned IS NULL OR cleaned = '' THEN
    RETURN 0;
  END IF;

  RETURN cleaned::numeric;
EXCEPTION WHEN others THEN
  RETURN 0;
END;
$$;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS subtotal_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_fee_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS coupon_id bigint,
ADD COLUMN IF NOT EXISTS coupon_code text,
ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'IDR';


-- Wallet summary compatibility used by the wallet overview and escrow payout flow.
ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS total_earned numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_withdrawn numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Analytics writes now go through /api/marketplace/events using the service role.
-- Remove the legacy policy that allowed arbitrary anonymous inserts.
DROP POLICY IF EXISTS "Anyone can insert marketplace analytics events"
ON public.marketplace_events;

CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id bigserial PRIMARY KEY,
  coupon_id bigint,
  user_id uuid,
  order_id bigint,
  original_amount numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  final_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coupon_usages
ADD COLUMN IF NOT EXISTS coupon_id bigint,
ADD COLUMN IF NOT EXISTS user_id uuid,
ADD COLUMN IF NOT EXISTS order_id bigint,
ADD COLUMN IF NOT EXISTS original_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_id
ON public.coupon_usages(coupon_id);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_user_id
ON public.coupon_usages(user_id);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_order_id
ON public.coupon_usages(order_id);

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  p_buyer_id uuid,
  p_product_id bigint,
  p_quantity integer,
  p_payment_method text,
  p_coupon_code text DEFAULT NULL,
  p_payment_fee_rate numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_coupon record;
  v_order_id bigint;
  v_quantity integer;
  v_unit_price numeric;
  v_subtotal numeric;
  v_discount numeric := 0;
  v_fee_rate numeric;
  v_payment_fee numeric := 0;
  v_total numeric;
  v_coupon_code text;
BEGIN
  IF p_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  v_quantity := GREATEST(1, LEAST(COALESCE(p_quantity, 1), 100));

  IF lower(COALESCE(p_payment_method, '')) NOT IN ('wallet', 'paypal') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  SELECT
    id,
    title,
    price,
    seller_id,
    seller_name,
    seller,
    game_name,
    category,
    stock,
    status
  INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  IF lower(COALESCE(v_product.status, 'active')) <> 'active' THEN
    RAISE EXCEPTION 'Product is inactive.';
  END IF;

  IF v_product.seller_id IS NULL THEN
    RAISE EXCEPTION 'Product seller ID is missing.';
  END IF;

  IF v_product.seller_id = p_buyer_id THEN
    RAISE EXCEPTION 'You cannot buy your own product.';
  END IF;

  IF COALESCE(v_product.stock, 0) < v_quantity THEN
    RAISE EXCEPTION 'Product stock is insufficient.';
  END IF;

  v_unit_price := public.cp_to_numeric(v_product.price::text);

  IF v_unit_price <= 0 THEN
    RAISE EXCEPTION 'Product price is invalid.';
  END IF;

  v_subtotal := v_unit_price * v_quantity;
  v_coupon_code := NULLIF(upper(btrim(COALESCE(p_coupon_code, ''))), '');

  IF v_coupon_code IS NOT NULL THEN
    SELECT *
    INTO v_coupon
    FROM public.coupons
    WHERE upper(code) = v_coupon_code
      AND lower(COALESCE(status, 'inactive')) = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Coupon not found or inactive.';
    END IF;

    IF v_coupon.start_at IS NOT NULL AND now() < v_coupon.start_at THEN
      RAISE EXCEPTION 'Coupon is not active yet.';
    END IF;

    IF v_coupon.end_at IS NOT NULL AND now() > v_coupon.end_at THEN
      RAISE EXCEPTION 'Coupon has expired.';
    END IF;

    IF v_coupon.usage_limit IS NOT NULL
      AND COALESCE(v_coupon.used_count, 0) >= v_coupon.usage_limit THEN
      RAISE EXCEPTION 'Coupon usage limit has been reached.';
    END IF;

    IF v_subtotal < public.cp_to_numeric(v_coupon.minimum_order_amount::text) THEN
      RAISE EXCEPTION 'Order does not meet the coupon minimum amount.';
    END IF;

    IF lower(COALESCE(v_coupon.discount_type, 'fixed')) = 'percent' THEN
      v_discount :=
        v_subtotal * public.cp_to_numeric(v_coupon.discount_value::text) / 100;

      IF v_coupon.maximum_discount_amount IS NOT NULL THEN
        v_discount := LEAST(
          v_discount,
          public.cp_to_numeric(v_coupon.maximum_discount_amount::text)
        );
      END IF;
    ELSE
      v_discount := public.cp_to_numeric(v_coupon.discount_value::text);
    END IF;

    v_discount := LEAST(v_subtotal, GREATEST(0, v_discount));
  END IF;

  v_fee_rate := LEAST(0.2, GREATEST(0, COALESCE(p_payment_fee_rate, 0)));

  IF lower(p_payment_method) = 'paypal' THEN
    v_payment_fee := ceil(GREATEST(0, v_subtotal - v_discount) * v_fee_rate);
  END IF;

  v_total := GREATEST(0, v_subtotal - v_discount + v_payment_fee);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Order total is invalid.';
  END IF;

  INSERT INTO public.orders (
    buyer_id,
    seller_id,
    product_id,
    quantity,
    subtotal_amount,
    discount_amount,
    payment_fee_amount,
    total_price,
    total_amount,
    price,
    status,
    payment_status,
    payment_method,
    product_title,
    seller_name,
    game_name,
    category,
    coupon_id,
    coupon_code,
    currency_code,
    escrow_status,
    created_at,
    updated_at
  )
  VALUES (
    p_buyer_id,
    v_product.seller_id,
    v_product.id,
    v_quantity,
    v_subtotal,
    v_discount,
    v_payment_fee,
    v_total,
    v_total,
    v_total::text,
    'pending',
    'unpaid',
    lower(p_payment_method),
    v_product.title,
    COALESCE(v_product.seller_name, v_product.seller, 'Seller'),
    v_product.game_name,
    v_product.category,
    CASE WHEN v_coupon_code IS NOT NULL THEN v_coupon.id ELSE NULL END,
    v_coupon_code,
    'IDR',
    'pending',
    now(),
    now()
  )
  RETURNING id INTO v_order_id;

  IF v_coupon_code IS NOT NULL THEN
    UPDATE public.coupons
    SET used_count = COALESCE(used_count, 0) + 1
    WHERE id = v_coupon.id;

    INSERT INTO public.coupon_usages (
      coupon_id,
      user_id,
      order_id,
      original_amount,
      discount_amount,
      final_amount,
      created_at
    )
    VALUES (
      v_coupon.id,
      p_buyer_id,
      v_order_id,
      v_subtotal,
      v_discount,
      v_total,
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'payment_fee', v_payment_fee,
    'total', v_total,
    'payment_method', lower(p_payment_method),
    'coupon_code', v_coupon_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order(
  uuid, bigint, integer, text, text, numeric
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_marketplace_order(
  uuid, bigint, integer, text, text, numeric
) TO service_role;

COMMIT;

SELECT 'comeplayers_foundation_v3_ready' AS status;
