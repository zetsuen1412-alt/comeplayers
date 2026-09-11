-- ComePlayers Security Boundary V6
-- Run after Foundation V3 + Security V4 + Security V5.
-- Adds encrypted digital delivery storage and strict owner/admin RLS for
-- orders, wallets, wallet transactions, wallet top-ups, and PayPal records.

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_delivery_vaults (
  order_id bigint PRIMARY KEY,
  seller_id uuid NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  reveal_count integer NOT NULL DEFAULT 0,
  last_revealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_delivery_vaults
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS ciphertext text,
  ADD COLUMN IF NOT EXISTS iv text,
  ADD COLUMN IF NOT EXISTS auth_tag text,
  ADD COLUMN IF NOT EXISTS key_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reveal_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_revealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.order_delivery_access_logs (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL,
  user_id uuid NOT NULL,
  access_role text NOT NULL,
  action text NOT NULL,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_vault_seller_id
  ON public.order_delivery_vaults(seller_id);
CREATE INDEX IF NOT EXISTS idx_delivery_access_order_id
  ON public.order_delivery_access_logs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_access_user_id
  ON public.order_delivery_access_logs(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.cp_record_delivery_access(
  p_order_id bigint,
  p_user_id uuid,
  p_access_role text,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.order_delivery_vaults
  SET
    reveal_count = COALESCE(reveal_count, 0) + CASE WHEN p_action = 'reveal' THEN 1 ELSE 0 END,
    last_revealed_at = CASE WHEN p_action = 'reveal' THEN now() ELSE last_revealed_at END,
    updated_at = now()
  WHERE order_id = p_order_id;

  INSERT INTO public.order_delivery_access_logs (
    order_id, user_id, access_role, action
  ) VALUES (
    p_order_id, p_user_id, p_access_role, p_action
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cp_record_delivery_access(bigint, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_record_delivery_access(bigint, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cp_store_encrypted_delivery(
  p_order_id bigint,
  p_seller_id uuid,
  p_ciphertext text,
  p_iv text,
  p_auth_tag text,
  p_key_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_status text;
  v_payment_status text;
  v_escrow_status text;
  v_first_delivery boolean;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.seller_id IS DISTINCT FROM p_seller_id THEN
    RAISE EXCEPTION 'Only this order seller can deliver it.';
  END IF;

  v_status := lower(COALESCE(v_order.status, ''));
  v_payment_status := lower(COALESCE(v_order.payment_status, ''));
  v_escrow_status := lower(COALESCE(v_order.escrow_status, ''));

  IF v_status = 'completed' OR v_escrow_status = 'released' THEN
    RAISE EXCEPTION 'A completed order can no longer be edited.';
  END IF;

  IF v_status IN ('cancelled', 'disputed') OR v_escrow_status = 'disputed' THEN
    RAISE EXCEPTION 'This order cannot be delivered in its current state.';
  END IF;

  IF NOT (
    v_payment_status = 'paid'
    OR v_status IN ('paid', 'delivered')
  ) THEN
    RAISE EXCEPTION 'Order must be paid before delivery.';
  END IF;

  v_first_delivery := v_order.delivered_at IS NULL;

  INSERT INTO public.order_delivery_vaults (
    order_id, seller_id, ciphertext, iv, auth_tag, key_version,
    created_at, updated_at
  ) VALUES (
    p_order_id, p_seller_id, p_ciphertext, p_iv, p_auth_tag,
    COALESCE(p_key_version, 1), v_now, v_now
  )
  ON CONFLICT (order_id) DO UPDATE SET
    seller_id = EXCLUDED.seller_id,
    ciphertext = EXCLUDED.ciphertext,
    iv = EXCLUDED.iv,
    auth_tag = EXCLUDED.auth_tag,
    key_version = EXCLUDED.key_version,
    updated_at = v_now;

  UPDATE public.orders
  SET
    status = 'delivered',
    payment_status = 'paid',
    escrow_status = 'holding',
    delivery_message = NULL,
    delivery_credentials = NULL,
    delivered_at = COALESCE(delivered_at, v_now),
    updated_at = v_now
  WHERE id = p_order_id;

  PERFORM public.cp_record_delivery_access(
    p_order_id,
    p_seller_id,
    'seller',
    CASE WHEN v_first_delivery THEN 'create' ELSE 'update' END
  );

  RETURN jsonb_build_object(
    'id', p_order_id,
    'buyer_id', v_order.buyer_id,
    'product_title', COALESCE(v_order.product_title, v_order.product, 'digital product'),
    'first_delivery', v_first_delivery,
    'status', 'delivered',
    'payment_status', 'paid',
    'escrow_status', 'holding',
    'delivered_at', COALESCE(v_order.delivered_at, v_now),
    'updated_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cp_store_encrypted_delivery(bigint, uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_store_encrypted_delivery(bigint, uuid, text, text, text, integer)
  TO service_role;

ALTER TABLE public.order_delivery_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_access_logs ENABLE ROW LEVEL SECURITY;

-- Deliberately no authenticated/anonymous policies. Only service-role APIs
-- may read or write ciphertext and access logs.
REVOKE ALL ON public.order_delivery_vaults FROM anon, authenticated;
REVOKE ALL ON public.order_delivery_access_logs FROM anon, authenticated;
GRANT ALL ON public.order_delivery_vaults TO service_role;
GRANT ALL ON public.order_delivery_access_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_delivery_access_logs_id_seq TO service_role;

-- Remove all legacy browser policies from core financial tables before
-- installing explicit least-privilege read policies.
DO $$
DECLARE
  policy_row record;
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'orders',
    'wallets',
    'wallet_transactions',
    'wallet_topups',
    'paypal_transactions'
  ]
  LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      FOR policy_row IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, target_table);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wallet_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.paypal_transactions ENABLE ROW LEVEL SECURITY;

-- Order rows can be read only by the buyer, seller, or admin. Mutations are
-- intentionally server-only through service-role API routes.
CREATE POLICY cp_orders_owner_read ON public.orders
FOR SELECT TO authenticated
USING (
  buyer_id = auth.uid()
  OR seller_id = auth.uid()
  OR (
    buyer_id IS NULL
    AND buyer = COALESCE(auth.jwt() ->> 'email', '')
  )
  OR public.cp_is_admin(auth.uid())
);

CREATE POLICY cp_wallets_owner_read ON public.wallets
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.cp_is_admin(auth.uid()));

CREATE POLICY cp_wallet_transactions_owner_read ON public.wallet_transactions
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.cp_is_admin(auth.uid()));

CREATE POLICY cp_wallet_topups_owner_read ON public.wallet_topups
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.cp_is_admin(auth.uid()));

-- PayPal transaction rows can contain provider metadata. Only admins may read
-- them from the browser; user-facing summaries come from protected APIs.
CREATE POLICY cp_paypal_transactions_admin_read ON public.paypal_transactions
FOR SELECT TO authenticated
USING (public.cp_is_admin(auth.uid()));

-- Block browser writes even when table-level grants existed in an older setup.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_topups FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.paypal_transactions FROM anon, authenticated;

GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.wallets TO authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT SELECT ON public.wallet_topups TO authenticated;
GRANT SELECT ON public.paypal_transactions TO authenticated;

COMMIT;

SELECT
  'comeplayers_security_boundary_v6_ready' AS status,
  (SELECT count(*) FROM public.order_delivery_vaults) AS encrypted_deliveries,
  (SELECT count(*) FROM public.order_delivery_access_logs) AS delivery_access_logs;
