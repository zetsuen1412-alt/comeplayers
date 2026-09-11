-- ComePlayers V13: Secure Seller Catalog, Product Variants & Bulk Inventory
-- Run after V12 Messaging & Anti-Scam.
-- Adds server-managed SKUs/variants and makes V7 stock reservations variant-aware.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_variant_price numeric(18,2),
  ADD COLUMN IF NOT EXISTS max_variant_price numeric(18,2);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS variant_id bigint,
  ADD COLUMN IF NOT EXISTS variant_name text,
  ADD COLUMN IF NOT EXISTS variant_sku text;

ALTER TABLE public.product_stock_reservations
  ADD COLUMN IF NOT EXISTS variant_id bigint;

CREATE TABLE IF NOT EXISTS public.product_variants (
  id bigserial PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  price numeric(18,2) NOT NULL CHECK (price > 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_status_check CHECK (status IN ('active', 'inactive', 'archived'))
);

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS product_id bigint,
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS attributes jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price numeric(18,2),
  ADD COLUMN IF NOT EXISTS stock integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_seller_sku
  ON public.product_variants(seller_id, lower(sku))
  WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON public.product_variants(product_id, status, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_product_variants_seller
  ON public.product_variants(seller_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_variant_active
  ON public.product_stock_reservations(variant_id, expires_at)
  WHERE status = 'active' AND variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_variant_id
  ON public.orders(variant_id)
  WHERE variant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cp_sync_product_variant_summary(p_product_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_stock integer;
  v_min numeric(18,2);
  v_max numeric(18,2);
BEGIN
  SELECT
    count(*) FILTER (WHERE status <> 'archived')::integer,
    COALESCE(sum(stock) FILTER (WHERE status = 'active'), 0)::integer,
    min(price) FILTER (WHERE status = 'active'),
    max(price) FILTER (WHERE status = 'active')
  INTO v_count, v_stock, v_min, v_max
  FROM public.product_variants
  WHERE product_id = p_product_id;

  UPDATE public.products
  SET
    has_variants = COALESCE(v_count, 0) > 0,
    variant_count = COALESCE(v_count, 0),
    min_variant_price = v_min,
    max_variant_price = v_max,
    stock = CASE WHEN COALESCE(v_count, 0) > 0 THEN COALESCE(v_stock, 0) ELSE stock END,
    price = CASE WHEN v_min IS NOT NULL THEN v_min::text ELSE price END,
    updated_at = now()
  WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_product_variant_summary_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.cp_sync_product_variant_summary(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.cp_sync_product_variant_summary(NEW.product_id);

  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    PERFORM public.cp_sync_product_variant_summary(OLD.product_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_variant_summary ON public.product_variants;
CREATE TRIGGER trg_product_variant_summary
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.cp_product_variant_summary_trigger();

-- Seller/admin product mutations are now server-only.
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.product_variants FROM anon, authenticated;
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT ALL ON public.product_variants TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.product_variants_id_seq TO service_role;

DROP POLICY IF EXISTS product_variants_public_read ON public.product_variants;
CREATE POLICY product_variants_public_read
ON public.product_variants
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- Return stock to the correct SKU when an unpaid order is cancelled or expires.
CREATE OR REPLACE FUNCTION public.cp_release_order_reservation(
  p_order_id bigint,
  p_reason text DEFAULT 'released'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reservation public.product_stock_reservations%ROWTYPE;
  v_reason text := lower(trim(COALESCE(p_reason, 'released')));
  v_order_status text;
  v_payment_status text;
  v_coupon_id bigint;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  v_order_status := lower(COALESCE(v_order.status, ''));
  v_payment_status := lower(COALESCE(v_order.payment_status, ''));

  IF v_payment_status = 'paid'
    OR v_order_status IN ('paid', 'delivered', 'completed', 'refunded') THEN
    RETURN jsonb_build_object('released', false, 'reason', 'paid_or_final_order', 'order_id', p_order_id);
  END IF;

  SELECT * INTO v_reservation
  FROM public.product_stock_reservations
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR lower(COALESCE(v_reservation.status, '')) <> 'active' THEN
    RETURN jsonb_build_object('released', false, 'reason', 'no_active_reservation', 'order_id', p_order_id);
  END IF;

  IF v_reservation.variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = COALESCE(stock, 0) + GREATEST(v_reservation.quantity, 1), updated_at = now()
    WHERE id = v_reservation.variant_id;
  ELSE
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + GREATEST(v_reservation.quantity, 1), updated_at = now()
    WHERE id = v_reservation.product_id;
  END IF;

  UPDATE public.product_stock_reservations
  SET
    status = CASE WHEN v_reason = 'expired' THEN 'expired' ELSE 'released' END,
    released_at = now(),
    release_reason = v_reason,
    updated_at = now()
  WHERE id = v_reservation.id;

  SELECT coupon_id INTO v_coupon_id
  FROM public.coupon_usages
  WHERE order_id = p_order_id AND lower(COALESCE(status, '')) = 'reserved'
  ORDER BY id DESC LIMIT 1 FOR UPDATE;

  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.coupons
    SET used_count = GREATEST(0, COALESCE(used_count, 0) - 1)
    WHERE id = v_coupon_id;

    UPDATE public.coupon_usages
    SET status = 'released', released_at = now()
    WHERE order_id = p_order_id AND lower(COALESCE(status, '')) = 'reserved';
  END IF;

  UPDATE public.orders
  SET
    status = CASE WHEN v_reason = 'expired' THEN 'expired' ELSE 'cancelled' END,
    payment_status = CASE WHEN v_reason = 'expired' THEN 'expired' ELSE 'cancelled' END,
    reservation_status = CASE WHEN v_reason = 'expired' THEN 'expired' ELSE 'released' END,
    expired_at = CASE WHEN v_reason = 'expired' THEN now() ELSE expired_at END,
    expiration_reason = v_reason,
    cancelled_at = CASE WHEN v_reason <> 'expired' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'released', true,
    'order_id', p_order_id,
    'product_id', v_reservation.product_id,
    'variant_id', v_reservation.variant_id,
    'quantity', v_reservation.quantity,
    'reason', v_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_prepare_order_payment(
  p_order_id bigint,
  p_buyer_id uuid,
  p_extension_minutes integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reservation public.product_stock_reservations%ROWTYPE;
  v_available_stock integer;
  v_quantity integer;
  v_new_expiry timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'Buyer mismatch for this order.'; END IF;

  IF lower(COALESCE(v_order.payment_status, '')) = 'paid'
    OR lower(COALESCE(v_order.status, '')) IN ('paid', 'delivered', 'completed') THEN
    RETURN jsonb_build_object('already_paid', true, 'order_id', p_order_id);
  END IF;

  IF lower(COALESCE(v_order.status, '')) IN ('cancelled', 'expired', 'refunded') THEN
    RAISE EXCEPTION 'This checkout is no longer active. Please create a new order.';
  END IF;

  v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);
  v_new_expiry := now() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_extension_minutes, 20), 60)));

  SELECT * INTO v_reservation
  FROM public.product_stock_reservations
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF FOUND AND lower(COALESCE(v_reservation.status, '')) = 'active' THEN
    IF v_reservation.expires_at <= now() THEN
      PERFORM public.cp_release_order_reservation(p_order_id, 'expired');
      RAISE EXCEPTION 'Order reservation expired. Please create a new checkout.';
    END IF;

    UPDATE public.product_stock_reservations
    SET expires_at = GREATEST(expires_at, v_new_expiry), updated_at = now()
    WHERE id = v_reservation.id;

    UPDATE public.orders
    SET reservation_status = 'active',
        reservation_expires_at = GREATEST(COALESCE(reservation_expires_at, v_new_expiry), v_new_expiry),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('already_paid', false, 'reservation_status', 'active',
      'expires_at', GREATEST(v_reservation.expires_at, v_new_expiry), 'order_id', p_order_id);
  END IF;

  IF v_order.product_id IS NULL THEN RAISE EXCEPTION 'Order product is missing.'; END IF;

  IF v_order.variant_id IS NOT NULL THEN
    SELECT COALESCE(stock, 0) INTO v_available_stock
    FROM public.product_variants
    WHERE id = v_order.variant_id AND product_id = v_order.product_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product variant is not available.'; END IF;
    IF v_available_stock < v_quantity THEN RAISE EXCEPTION 'Product variant stock is no longer sufficient.'; END IF;

    UPDATE public.product_variants
    SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity), updated_at = now()
    WHERE id = v_order.variant_id;
  ELSE
    SELECT COALESCE(stock, 0) INTO v_available_stock
    FROM public.products WHERE id = v_order.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;
    IF v_available_stock < v_quantity THEN RAISE EXCEPTION 'Product stock is no longer sufficient.'; END IF;

    UPDATE public.products
    SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity), updated_at = now()
    WHERE id = v_order.product_id;
  END IF;

  INSERT INTO public.product_stock_reservations (
    order_id, product_id, variant_id, buyer_id, quantity, status, expires_at, created_at, updated_at
  ) VALUES (
    p_order_id, v_order.product_id, v_order.variant_id, p_buyer_id, v_quantity, 'active', v_new_expiry, now(), now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    variant_id = EXCLUDED.variant_id,
    buyer_id = EXCLUDED.buyer_id,
    quantity = EXCLUDED.quantity,
    status = 'active',
    expires_at = EXCLUDED.expires_at,
    consumed_at = NULL,
    released_at = NULL,
    release_reason = NULL,
    updated_at = now();

  UPDATE public.orders
  SET reservation_status = 'active', reservation_expires_at = v_new_expiry, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('already_paid', false, 'reservation_status', 'active',
    'expires_at', v_new_expiry, 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_consume_order_reservation(
  p_order_id bigint,
  p_buyer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reservation public.product_stock_reservations%ROWTYPE;
  v_available_stock integer;
  v_quantity integer;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'Buyer mismatch for this order.'; END IF;

  SELECT * INTO v_reservation
  FROM public.product_stock_reservations
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF FOUND AND lower(COALESCE(v_reservation.status, '')) = 'consumed' THEN
    RETURN jsonb_build_object('already_consumed', true, 'order_id', p_order_id);
  END IF;

  IF FOUND AND lower(COALESCE(v_reservation.status, '')) = 'active' THEN
    IF v_reservation.expires_at <= now() THEN
      PERFORM public.cp_release_order_reservation(p_order_id, 'expired');
      RAISE EXCEPTION 'Order reservation expired before payment completed.';
    END IF;

    UPDATE public.product_stock_reservations
    SET status = 'consumed', consumed_at = now(), updated_at = now()
    WHERE id = v_reservation.id;
  ELSE
    v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);
    IF v_order.product_id IS NULL THEN RAISE EXCEPTION 'Order product is missing.'; END IF;

    IF v_order.variant_id IS NOT NULL THEN
      SELECT COALESCE(stock, 0) INTO v_available_stock
      FROM public.product_variants
      WHERE id = v_order.variant_id AND product_id = v_order.product_id AND status = 'active'
      FOR UPDATE;
      IF NOT FOUND OR v_available_stock < v_quantity THEN
        RAISE EXCEPTION 'Product variant stock is no longer sufficient.';
      END IF;
      UPDATE public.product_variants
      SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity), updated_at = now()
      WHERE id = v_order.variant_id;
    ELSE
      SELECT COALESCE(stock, 0) INTO v_available_stock
      FROM public.products WHERE id = v_order.product_id FOR UPDATE;
      IF NOT FOUND OR v_available_stock < v_quantity THEN RAISE EXCEPTION 'Product stock is no longer sufficient.'; END IF;
      UPDATE public.products
      SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity), updated_at = now()
      WHERE id = v_order.product_id;
    END IF;

    INSERT INTO public.product_stock_reservations (
      order_id, product_id, variant_id, buyer_id, quantity, status, expires_at,
      consumed_at, created_at, updated_at
    ) VALUES (
      p_order_id, v_order.product_id, v_order.variant_id, p_buyer_id, v_quantity,
      'consumed', now(), now(), now(), now()
    )
    ON CONFLICT (order_id) DO UPDATE SET
      variant_id = EXCLUDED.variant_id,
      status = 'consumed', consumed_at = now(), updated_at = now();
  END IF;

  UPDATE public.orders SET reservation_status = 'consumed', updated_at = now() WHERE id = p_order_id;
  UPDATE public.coupon_usages
  SET status = 'consumed', consumed_at = COALESCE(consumed_at, now())
  WHERE order_id = p_order_id AND lower(COALESCE(status, 'reserved')) = 'reserved';

  RETURN jsonb_build_object('already_consumed', false, 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_marketplace_order_v13(
  p_buyer_id uuid,
  p_product_id bigint,
  p_variant_id bigint DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_payment_method text DEFAULT 'wallet',
  p_coupon_code text DEFAULT NULL,
  p_payment_fee_rate numeric DEFAULT 0,
  p_reservation_minutes integer DEFAULT 20
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
BEGIN
  IF p_buyer_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  PERFORM public.cp_release_expired_stock_reservations(200);

  v_quantity := GREATEST(1, LEAST(COALESCE(p_quantity, 1), 100));
  v_expires_at := now() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_reservation_minutes, 20), 60)));

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

    v_unit_price := v_variant.price;
    v_available_stock := COALESCE(v_variant.stock, 0);
    v_variant_name := v_variant.name;
    v_variant_sku := v_variant.sku;
  ELSE
    IF p_variant_id IS NOT NULL THEN RAISE EXCEPTION 'This product does not use variants.'; END IF;
    v_unit_price := public.cp_to_numeric(v_product.price::text);
    v_available_stock := COALESCE(v_product.stock, 0);
  END IF;

  IF v_available_stock < v_quantity THEN RAISE EXCEPTION 'Product stock is insufficient.'; END IF;
  IF v_unit_price <= 0 THEN RAISE EXCEPTION 'Product price is invalid.'; END IF;

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
    v_variant_name,
    v_variant_sku,
    v_quantity, v_subtotal, v_discount, v_payment_fee, v_total, v_total, v_total::text,
    'pending_payment', 'unpaid', lower(p_payment_method), v_product.title,
    COALESCE(v_product.seller_name, v_product.seller, 'Seller'), v_product.game_name, v_product.category,
    v_coupon_id,
    v_coupon_code, 'IDR', 'pending', 'active', v_expires_at, now(), now()
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

REVOKE ALL ON FUNCTION public.cp_sync_product_variant_summary(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_marketplace_order_v13(uuid, bigint, bigint, integer, text, text, numeric, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_sync_product_variant_summary(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_v13(uuid, bigint, bigint, integer, text, text, numeric, integer)
  TO service_role;

-- Normalize any pre-existing variants if this migration is re-run.
DO $$
DECLARE v_product_id bigint;
BEGIN
  FOR v_product_id IN SELECT DISTINCT product_id FROM public.product_variants LOOP
    PERFORM public.cp_sync_product_variant_summary(v_product_id);
  END LOOP;
END;
$$;

COMMIT;

SELECT 'comeplayers_catalog_variants_v13_ready' AS status;
