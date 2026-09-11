-- ComePlayers V7: Stock Reservation & Order Expiration
-- Run after Foundation V3 + Security V4/V5/V6 + Transaction Core V2.1.
-- Adds atomic stock reservation, abandoned-checkout expiration, coupon release,
-- and payment finalization without double-decrementing inventory.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reservation_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiration_reason text;

ALTER TABLE public.coupon_usages
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'consumed',
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

UPDATE public.coupon_usages
SET
  status = COALESCE(NULLIF(status, ''), 'consumed'),
  consumed_at = CASE
    WHEN COALESCE(NULLIF(status, ''), 'consumed') = 'consumed'
      THEN COALESCE(consumed_at, created_at, now())
    ELSE consumed_at
  END;

CREATE TABLE IF NOT EXISTS public.product_stock_reservations (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL UNIQUE,
  product_id bigint NOT NULL,
  buyer_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_stock_reservations
  ADD COLUMN IF NOT EXISTS order_id bigint,
  ADD COLUMN IF NOT EXISTS product_id bigint,
  ADD COLUMN IF NOT EXISTS buyer_id uuid,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_reservations_order_id
  ON public.product_stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_active
  ON public.product_stock_reservations(product_id, expires_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_stock_reservations_buyer
  ON public.product_stock_reservations(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_reservation_expiry
  ON public.orders(reservation_expires_at)
  WHERE reservation_status = 'active';

ALTER TABLE public.product_stock_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_stock_reservations FROM anon, authenticated;
GRANT ALL ON public.product_stock_reservations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.product_stock_reservations_id_seq TO service_role;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  v_order_status := lower(COALESCE(v_order.status, ''));
  v_payment_status := lower(COALESCE(v_order.payment_status, ''));

  IF v_payment_status = 'paid'
    OR v_order_status IN ('paid', 'delivered', 'completed', 'refunded') THEN
    RETURN jsonb_build_object(
      'released', false,
      'reason', 'paid_or_final_order',
      'order_id', p_order_id
    );
  END IF;

  SELECT * INTO v_reservation
  FROM public.product_stock_reservations
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR lower(COALESCE(v_reservation.status, '')) <> 'active' THEN
    RETURN jsonb_build_object(
      'released', false,
      'reason', 'no_active_reservation',
      'order_id', p_order_id
    );
  END IF;

  UPDATE public.products
  SET stock = COALESCE(stock, 0) + GREATEST(v_reservation.quantity, 1)
  WHERE id = v_reservation.product_id;

  UPDATE public.product_stock_reservations
  SET
    status = CASE WHEN v_reason = 'expired' THEN 'expired' ELSE 'released' END,
    released_at = now(),
    release_reason = v_reason,
    updated_at = now()
  WHERE id = v_reservation.id;

  SELECT coupon_id INTO v_coupon_id
  FROM public.coupon_usages
  WHERE order_id = p_order_id
    AND lower(COALESCE(status, '')) = 'reserved'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.coupons
    SET used_count = GREATEST(0, COALESCE(used_count, 0) - 1)
    WHERE id = v_coupon_id;

    UPDATE public.coupon_usages
    SET status = 'released', released_at = now()
    WHERE order_id = p_order_id
      AND lower(COALESCE(status, '')) = 'reserved';
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
    'quantity', v_reservation.quantity,
    'reason', v_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_release_expired_stock_reservations(
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_scanned integer := 0;
  v_released integer := 0;
  v_result jsonb;
BEGIN
  FOR v_row IN
    SELECT order_id
    FROM public.product_stock_reservations
    WHERE status = 'active'
      AND expires_at <= now()
    ORDER BY expires_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
    FOR UPDATE SKIP LOCKED
  LOOP
    v_scanned := v_scanned + 1;
    v_result := public.cp_release_order_reservation(v_row.order_id, 'expired');
    IF COALESCE((v_result->>'released')::boolean, false) THEN
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'released', v_released,
    'processed_at', now()
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
  v_product_stock integer;
  v_quantity integer;
  v_new_expiry timestamptz;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Buyer mismatch for this order.';
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) = 'paid'
    OR lower(COALESCE(v_order.status, '')) IN ('paid', 'delivered', 'completed') THEN
    RETURN jsonb_build_object('already_paid', true, 'order_id', p_order_id);
  END IF;

  IF lower(COALESCE(v_order.status, '')) IN ('cancelled', 'expired', 'refunded') THEN
    RAISE EXCEPTION 'This checkout is no longer active. Please create a new order.';
  END IF;

  v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);
  v_new_expiry := now() + make_interval(
    mins => GREATEST(5, LEAST(COALESCE(p_extension_minutes, 20), 60))
  );

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
    SET
      reservation_status = 'active',
      reservation_expires_at = GREATEST(COALESCE(reservation_expires_at, v_new_expiry), v_new_expiry),
      updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'already_paid', false,
      'reservation_status', 'active',
      'expires_at', GREATEST(v_reservation.expires_at, v_new_expiry),
      'order_id', p_order_id
    );
  END IF;

  IF v_order.product_id IS NULL THEN
    RAISE EXCEPTION 'Order product is missing.';
  END IF;

  SELECT COALESCE(stock, 0) INTO v_product_stock
  FROM public.products
  WHERE id = v_order.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  IF v_product_stock < v_quantity THEN
    RAISE EXCEPTION 'Product stock is no longer sufficient.';
  END IF;

  UPDATE public.products
  SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity)
  WHERE id = v_order.product_id;

  INSERT INTO public.product_stock_reservations (
    order_id, product_id, buyer_id, quantity, status, expires_at,
    created_at, updated_at
  ) VALUES (
    p_order_id, v_order.product_id, p_buyer_id, v_quantity, 'active',
    v_new_expiry, now(), now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    buyer_id = EXCLUDED.buyer_id,
    quantity = EXCLUDED.quantity,
    status = 'active',
    expires_at = EXCLUDED.expires_at,
    consumed_at = NULL,
    released_at = NULL,
    release_reason = NULL,
    updated_at = now();

  UPDATE public.orders
  SET
    reservation_status = 'active',
    reservation_expires_at = v_new_expiry,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'already_paid', false,
    'reservation_status', 'active',
    'expires_at', v_new_expiry,
    'order_id', p_order_id
  );
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
  v_product_stock integer;
  v_quantity integer;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Buyer mismatch for this order.';
  END IF;

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
    -- Backward compatibility for orders created before V7.
    v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);

    IF v_order.product_id IS NULL THEN
      RAISE EXCEPTION 'Order product is missing.';
    END IF;

    SELECT COALESCE(stock, 0) INTO v_product_stock
    FROM public.products
    WHERE id = v_order.product_id
    FOR UPDATE;

    IF NOT FOUND OR v_product_stock < v_quantity THEN
      RAISE EXCEPTION 'Product stock is no longer sufficient.';
    END IF;

    UPDATE public.products
    SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity)
    WHERE id = v_order.product_id;

    INSERT INTO public.product_stock_reservations (
      order_id, product_id, buyer_id, quantity, status, expires_at,
      consumed_at, created_at, updated_at
    ) VALUES (
      p_order_id, v_order.product_id, p_buyer_id, v_quantity, 'consumed',
      now(), now(), now(), now()
    )
    ON CONFLICT (order_id) DO UPDATE SET
      status = 'consumed',
      consumed_at = now(),
      updated_at = now();
  END IF;

  UPDATE public.orders
  SET reservation_status = 'consumed', updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.coupon_usages
  SET status = 'consumed', consumed_at = COALESCE(consumed_at, now())
  WHERE order_id = p_order_id
    AND lower(COALESCE(status, 'reserved')) = 'reserved';

  RETURN jsonb_build_object('already_consumed', false, 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_cancel_unpaid_order(
  p_order_id bigint,
  p_buyer_id uuid,
  p_reason text DEFAULT 'buyer_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Only the buyer can cancel this order.';
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) = 'paid'
    OR lower(COALESCE(v_order.status, '')) IN ('paid', 'delivered', 'completed', 'refunded') THEN
    RAISE EXCEPTION 'Paid or completed orders cannot be cancelled.';
  END IF;

  RETURN public.cp_release_order_reservation(
    p_order_id,
    COALESCE(NULLIF(trim(p_reason), ''), 'buyer_cancelled')
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_marketplace_order(
  uuid, bigint, integer, text, text, numeric
);

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  p_buyer_id uuid,
  p_product_id bigint,
  p_quantity integer,
  p_payment_method text,
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
  v_expires_at timestamptz;
BEGIN
  IF p_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  PERFORM public.cp_release_expired_stock_reservations(200);

  v_quantity := GREATEST(1, LEAST(COALESCE(p_quantity, 1), 100));
  v_expires_at := now() + make_interval(
    mins => GREATEST(5, LEAST(COALESCE(p_reservation_minutes, 20), 60))
  );

  IF lower(COALESCE(p_payment_method, '')) NOT IN ('wallet', 'paypal') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  SELECT
    id, title, price, seller_id, seller_name, seller,
    game_name, category, stock, status
  INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

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
    SELECT * INTO v_coupon
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
      v_discount := v_subtotal * public.cp_to_numeric(v_coupon.discount_value::text) / 100;
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

  UPDATE public.products
  SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity)
  WHERE id = v_product.id;

  INSERT INTO public.orders (
    buyer_id, seller_id, product_id, quantity,
    subtotal_amount, discount_amount, payment_fee_amount,
    total_price, total_amount, price,
    status, payment_status, payment_method,
    product_title, seller_name, game_name, category,
    coupon_id, coupon_code, currency_code, escrow_status,
    reservation_status, reservation_expires_at,
    created_at, updated_at
  ) VALUES (
    p_buyer_id, v_product.seller_id, v_product.id, v_quantity,
    v_subtotal, v_discount, v_payment_fee,
    v_total, v_total, v_total::text,
    'pending_payment', 'unpaid', lower(p_payment_method),
    v_product.title,
    COALESCE(v_product.seller_name, v_product.seller, 'Seller'),
    v_product.game_name, v_product.category,
    CASE WHEN v_coupon_code IS NOT NULL THEN v_coupon.id ELSE NULL END,
    v_coupon_code, 'IDR', 'pending',
    'active', v_expires_at,
    now(), now()
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.product_stock_reservations (
    order_id, product_id, buyer_id, quantity, status, expires_at,
    created_at, updated_at
  ) VALUES (
    v_order_id, v_product.id, p_buyer_id, v_quantity,
    'active', v_expires_at, now(), now()
  );

  IF v_coupon_code IS NOT NULL THEN
    UPDATE public.coupons
    SET used_count = COALESCE(used_count, 0) + 1
    WHERE id = v_coupon.id;

    INSERT INTO public.coupon_usages (
      coupon_id, user_id, order_id,
      original_amount, discount_amount, final_amount,
      status, created_at
    ) VALUES (
      v_coupon.id, p_buyer_id, v_order_id,
      v_subtotal, v_discount, v_total,
      'reserved', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'payment_fee', v_payment_fee,
    'total', v_total,
    'payment_method', lower(p_payment_method),
    'coupon_code', v_coupon_code,
    'reservation_status', 'active',
    'reservation_expires_at', v_expires_at
  );
EXCEPTION WHEN others THEN
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_paypal_order_payment(
  p_order_id bigint,
  p_buyer_id uuid,
  p_paypal_order_id text,
  p_paypal_capture_id text,
  p_amount_usd numeric,
  p_payment_proof text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Buyer mismatch for this order.';
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) = 'paid'
    OR lower(COALESCE(v_order.status, '')) IN ('paid', 'delivered', 'completed') THEN
    RETURN jsonb_build_object(
      'already_paid', true,
      'seller_id', v_order.seller_id,
      'order_id', v_order.id
    );
  END IF;

  IF v_order.paypal_order_id IS NOT NULL
    AND v_order.paypal_order_id <> p_paypal_order_id THEN
    RAISE EXCEPTION 'PayPal order ID mismatch.';
  END IF;

  PERFORM public.cp_consume_order_reservation(p_order_id, p_buyer_id);

  UPDATE public.orders
  SET
    status = 'paid', payment_status = 'paid', payment_method = 'paypal',
    paypal_order_id = p_paypal_order_id,
    paypal_capture_id = p_paypal_capture_id,
    paypal_amount_usd = p_amount_usd,
    payment_proof = p_payment_proof,
    escrow_status = 'holding', seller_payout_status = 'pending',
    reservation_status = 'consumed',
    paid_at = COALESCE(paid_at, now()), updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.paypal_transactions (
    order_id, user_id, paypal_order_id, paypal_capture_id,
    amount_usd, amount_idr, status
  ) VALUES (
    p_order_id, p_buyer_id, p_paypal_order_id, p_paypal_capture_id,
    p_amount_usd,
    COALESCE(NULLIF(v_order.total_amount, 0), NULLIF(v_order.total_price, 0), 0),
    'completed'
  )
  ON CONFLICT (order_id) WHERE order_id IS NOT NULL
  DO UPDATE SET
    paypal_order_id = EXCLUDED.paypal_order_id,
    paypal_capture_id = EXCLUDED.paypal_capture_id,
    amount_usd = EXCLUDED.amount_usd,
    status = 'completed';

  RETURN jsonb_build_object(
    'already_paid', false,
    'seller_id', v_order.seller_id,
    'order_id', v_order.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(
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
  v_wallet public.wallets%ROWTYPE;
  v_total numeric;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Buyer mismatch for this order.';
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) = 'paid'
    OR lower(COALESCE(v_order.status, '')) IN ('paid', 'delivered', 'completed') THEN
    RETURN jsonb_build_object(
      'already_paid', true,
      'seller_id', v_order.seller_id,
      'order_id', v_order.id
    );
  END IF;

  v_total := COALESCE(
    NULLIF(v_order.total_amount, 0),
    NULLIF(v_order.total_price, 0),
    NULLIF(regexp_replace(COALESCE(v_order.price::text, ''), '[^0-9]', '', 'g'), '')::numeric,
    0
  );
  IF v_total <= 0 THEN RAISE EXCEPTION 'Order total is invalid.'; END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_buyer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found.'; END IF;
  IF COALESCE(v_wallet.balance, 0) < v_total THEN
    RAISE EXCEPTION 'Insufficient wallet balance.';
  END IF;

  PERFORM public.cp_consume_order_reservation(p_order_id, p_buyer_id);

  UPDATE public.wallets
  SET balance = COALESCE(balance, 0) - v_total, updated_at = now()
  WHERE user_id = p_buyer_id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, order_id, type, transaction_type, amount,
    balance_before, balance_after, status, description
  ) VALUES (
    v_wallet.id, p_buyer_id, p_order_id,
    'buyer_order_payment', 'buyer_order_payment', -v_total,
    COALESCE(v_wallet.balance, 0), COALESCE(v_wallet.balance, 0) - v_total,
    'completed', 'ComePlayers marketplace order payment'
  ) ON CONFLICT DO NOTHING;

  UPDATE public.orders
  SET
    status = 'paid', payment_status = 'paid', payment_method = 'wallet',
    payment_proof = 'Paid with ComePlayers Wallet',
    escrow_status = 'holding', seller_payout_status = 'pending',
    reservation_status = 'consumed',
    paid_at = COALESCE(paid_at, now()), updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'already_paid', false,
    'seller_id', v_order.seller_id,
    'order_id', v_order.id,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_admin_confirm_manual_payment(
  p_order_id bigint,
  p_admin_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_method text;
BEGIN
  IF NOT public.cp_is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF lower(COALESCE(v_order.payment_status, '')) = 'paid' THEN
    RETURN jsonb_build_object('already_paid', true, 'order_id', v_order.id);
  END IF;

  v_method := lower(COALESCE(v_order.payment_method, 'manual'));
  IF v_method IN ('paypal', 'wallet') THEN
    RAISE EXCEPTION 'PayPal and wallet payments must use their own verified payment flow.';
  END IF;

  IF v_order.buyer_id IS NULL THEN RAISE EXCEPTION 'Buyer ID is missing.'; END IF;
  PERFORM public.cp_consume_order_reservation(v_order.id, v_order.buyer_id);

  UPDATE public.orders
  SET
    status = 'paid', payment_status = 'paid', escrow_status = 'holding',
    seller_payout_status = 'pending', reservation_status = 'consumed',
    paid_at = COALESCE(paid_at, now()),
    admin_note = COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), admin_note),
    updated_at = now()
  WHERE id = v_order.id;

  IF v_order.buyer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
    VALUES (
      v_order.buyer_id, 'payment', 'Payment Confirmed',
      'Payment for order #' || v_order.id || ' was confirmed by an administrator.',
      '/orders/' || v_order.id, false
    );
  END IF;

  IF v_order.seller_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
    VALUES (
      v_order.seller_id, 'order', 'New Paid Order',
      'Order #' || v_order.id || ' is paid and ready for delivery.',
      '/orders/' || v_order.id, false
    );
  END IF;

  RETURN jsonb_build_object('already_paid', false, 'order_id', v_order.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_admin_override_order_status(
  p_order_id bigint,
  p_admin_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_status text;
  v_note text;
BEGIN
  IF NOT public.cp_is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_status := lower(trim(COALESCE(p_status, '')));
  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  IF v_status NOT IN ('processing', 'cancelled', 'disputed', 'delivered') THEN
    RAISE EXCEPTION 'Unsupported admin order status.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF lower(COALESCE(v_order.status, '')) IN ('completed', 'refunded') THEN
    RAISE EXCEPTION 'Completed or refunded orders cannot be overridden.';
  END IF;
  IF v_status IN ('cancelled', 'disputed') AND v_note IS NULL THEN
    RAISE EXCEPTION 'An admin note is required.';
  END IF;
  IF v_status = 'cancelled' AND lower(COALESCE(v_order.payment_status, '')) = 'paid' THEN
    RAISE EXCEPTION 'Paid orders must be refunded instead of cancelled.';
  END IF;
  IF v_status IN ('processing', 'delivered')
    AND lower(COALESCE(v_order.payment_status, '')) <> 'paid' THEN
    RAISE EXCEPTION 'Payment must be confirmed before this status change.';
  END IF;

  IF v_status = 'cancelled' THEN
    PERFORM public.cp_release_order_reservation(p_order_id, 'admin_cancelled');
  ELSE
    UPDATE public.orders
    SET
      status = v_status,
      admin_note = COALESCE(v_note, admin_note),
      delivered_at = CASE WHEN v_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      updated_at = now()
    WHERE id = p_order_id;
  END IF;

  IF v_order.buyer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
    VALUES (
      v_order.buyer_id, 'order', 'Order Status Updated',
      'Order #' || p_order_id || ' is now ' || v_status || '.',
      '/orders/' || p_order_id, false
    );
  END IF;

  IF v_order.seller_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
    VALUES (
      v_order.seller_id, 'order', 'Order Status Updated',
      'Order #' || p_order_id || ' is now ' || v_status || '.',
      '/orders/' || p_order_id, false
    );
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.cp_release_order_reservation(bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_release_expired_stock_reservations(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_prepare_order_payment(bigint, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_consume_order_reservation(bigint, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_cancel_unpaid_order(bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_marketplace_order(uuid, bigint, integer, text, text, numeric, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cp_release_order_reservation(bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_release_expired_stock_reservations(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_prepare_order_payment(bigint, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_consume_order_reservation(bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_cancel_unpaid_order(bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(uuid, bigint, integer, text, text, numeric, integer) TO service_role;

COMMIT;

SELECT 'comeplayers_stock_reservation_v7_ready' AS status;
