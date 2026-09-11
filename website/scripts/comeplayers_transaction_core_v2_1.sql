-- ComePlayers Transaction Core V2.1
-- Run once in Supabase SQL Editor. It also adds the required compatibility columns.
-- This migration is additive and idempotent. It does not drop existing data.

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

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS seller_id uuid,
ADD COLUMN IF NOT EXISTS seller_name text,
ADD COLUMN IF NOT EXISTS game_name text,
ADD COLUMN IF NOT EXISTS image_url text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS stock integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.products
SET seller_name = COALESCE(seller_name, seller)
WHERE seller_name IS NULL;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS buyer_id uuid,
ADD COLUMN IF NOT EXISTS seller_id uuid,
ADD COLUMN IF NOT EXISTS product_id integer,
ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS payment_proof text,
ADD COLUMN IF NOT EXISTS product_title text,
ADD COLUMN IF NOT EXISTS seller_name text,
ADD COLUMN IF NOT EXISTS game_name text,
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS paypal_order_id text,
ADD COLUMN IF NOT EXISTS paypal_capture_id text;

UPDATE public.orders o
SET
  product_title = COALESCE(o.product_title, p.title, o.product),
  seller_name = COALESCE(o.seller_name, p.seller_name, p.seller),
  seller_id = COALESCE(o.seller_id, p.seller_id),
  game_name = COALESCE(o.game_name, p.game_name),
  category = COALESCE(o.category, p.category),
  total_amount = CASE
    WHEN COALESCE(o.total_amount, 0) > 0 THEN o.total_amount
    WHEN COALESCE(o.total_price, 0) > 0 THEN o.total_price
    WHEN o.price IS NOT NULL THEN public.cp_to_numeric(o.price::text)
    WHEN p.price IS NOT NULL THEN public.cp_to_numeric(p.price::text)
    ELSE 0
  END,
  total_price = CASE
    WHEN COALESCE(o.total_price, 0) > 0 THEN o.total_price
    WHEN COALESCE(o.total_amount, 0) > 0 THEN o.total_amount
    WHEN o.price IS NOT NULL THEN public.cp_to_numeric(o.price::text)
    WHEN p.price IS NOT NULL THEN public.cp_to_numeric(p.price::text)
    ELSE 0
  END
FROM public.products p
WHERE p.id = o.product_id;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS escrow_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS delivery_message text,
ADD COLUMN IF NOT EXISTS delivery_credentials text,
ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS paid_at timestamptz,
ADD COLUMN IF NOT EXISTS marketplace_fee_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS seller_earning_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS seller_payout_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS paypal_amount_usd numeric,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.wallets (
  id bigserial PRIMARY KEY,
  user_id uuid,
  balance numeric DEFAULT 0,
  pending_balance numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS user_id uuid,
ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_id_unique_idx
ON public.wallets(user_id);

-- Existing ComePlayers installations already have wallet_transactions with
-- legacy columns such as wallet_id and type. CREATE TABLE IF NOT EXISTS does
-- not add missing columns, so keep both legacy and V2 compatibility columns.
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id bigserial PRIMARY KEY,
  wallet_id bigint,
  user_id uuid,
  order_id bigint,
  type text,
  transaction_type text,
  amount numeric DEFAULT 0,
  balance_before numeric DEFAULT 0,
  balance_after numeric DEFAULT 0,
  status text DEFAULT 'completed',
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.wallet_transactions
ADD COLUMN IF NOT EXISTS wallet_id bigint,
ADD COLUMN IF NOT EXISTS user_id uuid,
ADD COLUMN IF NOT EXISTS order_id bigint,
ADD COLUMN IF NOT EXISTS type text,
ADD COLUMN IF NOT EXISTS transaction_type text,
ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_before numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_after numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.wallet_transactions
SET
  type = COALESCE(type, transaction_type),
  transaction_type = COALESCE(transaction_type, type)
WHERE type IS NULL OR transaction_type IS NULL;

-- Only the two transaction kinds created by this migration must be unique per
-- order. Existing top-up/withdrawal history remains untouched.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_order_type_unique_idx
ON public.wallet_transactions(order_id, type)
WHERE order_id IS NOT NULL
  AND type IN ('buyer_order_payment', 'seller_order_payout');

CREATE TABLE IF NOT EXISTS public.paypal_transactions (
  id bigserial PRIMARY KEY,
  order_id bigint,
  user_id uuid,
  paypal_order_id text,
  paypal_capture_id text,
  amount_usd numeric,
  amount_idr numeric,
  status text DEFAULT 'completed',
  raw_response jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.paypal_transactions
ADD COLUMN IF NOT EXISTS order_id bigint,
ADD COLUMN IF NOT EXISTS user_id uuid,
ADD COLUMN IF NOT EXISTS paypal_order_id text,
ADD COLUMN IF NOT EXISTS paypal_capture_id text,
ADD COLUMN IF NOT EXISTS amount_usd numeric,
ADD COLUMN IF NOT EXISTS amount_idr numeric,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS raw_response jsonb,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS paypal_transactions_order_unique_idx
ON public.paypal_transactions(order_id)
WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS paypal_transactions_capture_unique_idx
ON public.paypal_transactions(paypal_capture_id)
WHERE paypal_capture_id IS NOT NULL;

UPDATE public.orders
SET
  escrow_status = CASE
    WHEN lower(COALESCE(status, '')) = 'completed' THEN 'released'
    WHEN lower(COALESCE(status, '')) = 'disputed' THEN 'disputed'
    WHEN lower(COALESCE(payment_status, '')) = 'paid'
      OR lower(COALESCE(status, '')) IN ('paid', 'delivered') THEN 'holding'
    ELSE COALESCE(NULLIF(escrow_status, ''), 'pending')
  END,
  paid_at = CASE
    WHEN paid_at IS NULL
      AND (
        lower(COALESCE(payment_status, '')) = 'paid'
        OR lower(COALESCE(status, '')) IN ('paid', 'delivered', 'completed')
      )
      THEN COALESCE(updated_at, created_at, now())
    ELSE paid_at
  END,
  seller_payout_status = CASE
    WHEN lower(COALESCE(status, '')) = 'completed' THEN 'released'
    ELSE COALESCE(NULLIF(seller_payout_status, ''), 'pending')
  END;

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
  v_stock integer;
  v_quantity integer;
BEGIN
  SELECT *
  INTO v_order
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

  v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);

  IF v_order.product_id IS NOT NULL THEN
    SELECT COALESCE(stock, 0)
    INTO v_stock
    FROM public.products
    WHERE id = v_order.product_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_stock < v_quantity THEN
        RAISE EXCEPTION 'Product stock is no longer sufficient.';
      END IF;

      UPDATE public.products
      SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity)
      WHERE id = v_order.product_id;
    END IF;
  END IF;

  UPDATE public.orders
  SET
    status = 'paid',
    payment_status = 'paid',
    payment_method = 'paypal',
    paypal_order_id = p_paypal_order_id,
    paypal_capture_id = p_paypal_capture_id,
    paypal_amount_usd = p_amount_usd,
    payment_proof = p_payment_proof,
    escrow_status = 'holding',
    seller_payout_status = 'pending',
    paid_at = COALESCE(paid_at, now()),
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.paypal_transactions (
    order_id,
    user_id,
    paypal_order_id,
    paypal_capture_id,
    amount_usd,
    amount_idr,
    status
  )
  VALUES (
    p_order_id,
    p_buyer_id,
    p_paypal_order_id,
    p_paypal_capture_id,
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
  v_stock integer;
  v_quantity integer;
BEGIN
  SELECT *
  INTO v_order
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

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Order total is invalid.';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_buyer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found.';
  END IF;

  IF COALESCE(v_wallet.balance, 0) < v_total THEN
    RAISE EXCEPTION 'Insufficient wallet balance.';
  END IF;

  v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);

  IF v_order.product_id IS NOT NULL THEN
    SELECT COALESCE(stock, 0)
    INTO v_stock
    FROM public.products
    WHERE id = v_order.product_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_stock < v_quantity THEN
        RAISE EXCEPTION 'Product stock is no longer sufficient.';
      END IF;

      UPDATE public.products
      SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity)
      WHERE id = v_order.product_id;
    END IF;
  END IF;

  UPDATE public.wallets
  SET
    balance = COALESCE(balance, 0) - v_total,
    updated_at = now()
  WHERE user_id = p_buyer_id;

  INSERT INTO public.wallet_transactions (
    wallet_id,
    user_id,
    order_id,
    type,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    status,
    description
  )
  VALUES (
    v_wallet.id,
    p_buyer_id,
    p_order_id,
    'buyer_order_payment',
    'buyer_order_payment',
    -v_total,
    COALESCE(v_wallet.balance, 0),
    COALESCE(v_wallet.balance, 0) - v_total,
    'completed',
    'ComePlayers marketplace order payment'
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.orders
  SET
    status = 'paid',
    payment_status = 'paid',
    payment_method = 'wallet',
    payment_proof = 'Paid with ComePlayers Wallet',
    escrow_status = 'holding',
    seller_payout_status = 'pending',
    paid_at = COALESCE(paid_at, now()),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'already_paid', false,
    'seller_id', v_order.seller_id,
    'order_id', v_order.id,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_order_and_release_escrow(
  p_order_id bigint,
  p_buyer_id uuid,
  p_fee_rate numeric DEFAULT 0.05
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_seller_wallet public.wallets%ROWTYPE;
  v_total numeric;
  v_fee_rate numeric;
  v_fee numeric;
  v_seller_earning numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_transaction_id bigint;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Only the buyer can complete this order.';
  END IF;

  IF lower(COALESCE(v_order.status, '')) = 'completed'
    OR lower(COALESCE(v_order.escrow_status, '')) = 'released' THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'seller_id', v_order.seller_id,
      'seller_earning', COALESCE(v_order.seller_earning_amount, 0),
      'marketplace_fee', COALESCE(v_order.marketplace_fee_amount, 0),
      'order_id', v_order.id
    );
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) <> 'paid' THEN
    RAISE EXCEPTION 'Order must be paid before completion.';
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'delivered' THEN
    RAISE EXCEPTION 'Order must be delivered before buyer confirmation.';
  END IF;

  IF v_order.seller_id IS NULL THEN
    RAISE EXCEPTION 'Seller ID is missing on this order.';
  END IF;

  v_total := COALESCE(
    NULLIF(v_order.total_amount, 0),
    NULLIF(v_order.total_price, 0),
    NULLIF(regexp_replace(COALESCE(v_order.price::text, ''), '[^0-9]', '', 'g'), '')::numeric,
    0
  );

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Order total is invalid.';
  END IF;

  v_fee_rate := LEAST(0.5, GREATEST(0, COALESCE(p_fee_rate, 0.05)));
  v_fee := round(v_total * v_fee_rate);
  v_seller_earning := GREATEST(0, v_total - v_fee);

  -- Ensure the seller has exactly one wallet, then lock it before calculating
  -- before/after balances and creating the payout ledger entry.
  INSERT INTO public.wallets (
    user_id,
    balance,
    pending_balance,
    created_at,
    updated_at
  )
  VALUES (
    v_order.seller_id,
    0,
    0,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_seller_wallet
  FROM public.wallets
  WHERE user_id = v_order.seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller wallet could not be created.';
  END IF;

  v_balance_before := COALESCE(v_seller_wallet.balance, 0);
  v_balance_after := v_balance_before + v_seller_earning;

  INSERT INTO public.wallet_transactions (
    wallet_id,
    user_id,
    order_id,
    type,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    status,
    description,
    metadata
  )
  VALUES (
    v_seller_wallet.id,
    v_order.seller_id,
    p_order_id,
    'seller_order_payout',
    'seller_order_payout',
    v_seller_earning,
    v_balance_before,
    v_balance_after,
    'completed',
    'Seller payout released from marketplace escrow',
    jsonb_build_object('marketplace_fee', v_fee, 'gross_total', v_total)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'seller_id', v_order.seller_id,
      'seller_earning', COALESCE(v_order.seller_earning_amount, v_seller_earning),
      'marketplace_fee', COALESCE(v_order.marketplace_fee_amount, v_fee),
      'order_id', v_order.id
    );
  END IF;

  UPDATE public.wallets
  SET
    balance = v_balance_after,
    updated_at = now()
  WHERE id = v_seller_wallet.id;

  UPDATE public.orders
  SET
    status = 'completed',
    payment_status = 'paid',
    escrow_status = 'released',
    seller_payout_status = 'released',
    marketplace_fee_amount = v_fee,
    seller_earning_amount = v_seller_earning,
    completed_at = now(),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'seller_id', v_order.seller_id,
    'seller_earning', v_seller_earning,
    'marketplace_fee', v_fee,
    'order_id', v_order.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_paypal_order_payment(bigint, uuid, text, text, numeric, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paypal_order_payment(bigint, uuid, text, text, numeric, text)
TO service_role;

REVOKE ALL ON FUNCTION public.pay_order_with_wallet(bigint, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(bigint, uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.complete_order_and_release_escrow(bigint, uuid, numeric)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_and_release_escrow(bigint, uuid, numeric)
TO service_role;

CREATE INDEX IF NOT EXISTS idx_orders_escrow_status
ON public.orders(escrow_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at
ON public.orders(delivered_at);
CREATE INDEX IF NOT EXISTS idx_orders_completed_at
ON public.orders(completed_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id
ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order_id
ON public.wallet_transactions(order_id);

COMMIT;

SELECT
  'comeplayers_transaction_core_v2_1_ready' AS status,
  (SELECT count(*) FROM public.orders) AS orders_count,
  (SELECT count(*) FROM public.wallets) AS wallets_count;
