-- ComePlayers Security Boundary V5
-- Run after Foundation V3, Transaction Core V2.1, and Security Boundary V4.
-- Adds atomic refunds/order overrides and safe RLS policies for promotion,
-- dispute, support, and audit tables.

BEGIN;

CREATE OR REPLACE FUNCTION public.cp_is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND lower(COALESCE(role, '')) = 'admin'
  );
$$;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS refund_reason text,
ADD COLUMN IF NOT EXISTS refund_reference text,
ADD COLUMN IF NOT EXISTS refund_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
ADD COLUMN IF NOT EXISTS refunded_by uuid,
ADD COLUMN IF NOT EXISTS admin_note text,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS cancelled_by uuid;

CREATE OR REPLACE FUNCTION public.cp_admin_finalize_order_refund(
  p_order_id bigint,
  p_admin_id uuid,
  p_reason text,
  p_refund_channel text,
  p_external_reference text DEFAULT NULL
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
  v_before numeric;
  v_after numeric;
  v_tx_id bigint;
  v_quantity integer;
  v_channel text;
  v_reason text;
BEGIN
  IF NOT public.cp_is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_reason := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_channel := lower(trim(COALESCE(p_refund_channel, 'manual')));

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A refund reason is required.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF lower(COALESCE(v_order.status, '')) = 'refunded'
    OR lower(COALESCE(v_order.payment_status, '')) = 'refunded' THEN
    RETURN jsonb_build_object(
      'already_refunded', true,
      'order_id', v_order.id,
      'refund_reference', v_order.refund_reference
    );
  END IF;

  IF lower(COALESCE(v_order.escrow_status, '')) = 'released'
    OR lower(COALESCE(v_order.seller_payout_status, '')) = 'released' THEN
    RAISE EXCEPTION 'Escrow has already been released.';
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) <> 'paid'
    AND lower(COALESCE(v_order.status, '')) NOT IN ('paid', 'delivered', 'disputed', 'refund_pending') THEN
    RAISE EXCEPTION 'Only paid orders can be refunded.';
  END IF;

  IF v_channel IN ('paypal', 'bank', 'qris', 'manual')
    AND NULLIF(trim(COALESCE(p_external_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'An external refund reference is required.';
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

  IF v_channel = 'wallet' THEN
    IF v_order.buyer_id IS NULL THEN
      RAISE EXCEPTION 'Buyer ID is missing on this order.';
    END IF;

    INSERT INTO public.wallets (user_id, balance, pending_balance, created_at, updated_at)
    VALUES (v_order.buyer_id, 0, 0, now(), now())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_order.buyer_id
    FOR UPDATE;

    v_before := COALESCE(v_wallet.balance, 0);
    v_after := v_before + v_total;

    INSERT INTO public.wallet_transactions (
      wallet_id, user_id, order_id, type, transaction_type, amount,
      balance_before, balance_after, status, description, metadata
    ) VALUES (
      v_wallet.id, v_order.buyer_id, v_order.id,
      'order_refund', 'order_refund', v_total,
      v_before, v_after, 'completed',
      'Marketplace order refund',
      jsonb_build_object('admin_id', p_admin_id, 'reason', v_reason)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_tx_id;

    IF v_tx_id IS NOT NULL THEN
      UPDATE public.wallets
      SET balance = v_after, updated_at = now()
      WHERE id = v_wallet.id;
    END IF;
  END IF;

  v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);
  IF v_order.product_id IS NOT NULL THEN
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + v_quantity
    WHERE id = v_order.product_id;
  END IF;

  UPDATE public.orders
  SET
    status = 'refunded',
    payment_status = 'refunded',
    escrow_status = 'refunded',
    seller_payout_status = 'cancelled',
    refund_reason = v_reason,
    refund_reference = NULLIF(trim(COALESCE(p_external_reference, '')), ''),
    refund_amount = v_total,
    refunded_at = now(),
    refunded_by = p_admin_id,
    admin_note = v_reason,
    updated_at = now()
  WHERE id = v_order.id;

  IF v_order.buyer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
    VALUES (
      v_order.buyer_id, 'refund', 'Order Refunded',
      'Order #' || v_order.id || ' was refunded. Reason: ' || v_reason,
      '/orders/' || v_order.id, false
    );
  END IF;

  IF v_order.seller_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
    VALUES (
      v_order.seller_id, 'refund', 'Order Refunded',
      'Order #' || v_order.id || ' was refunded by an administrator.',
      '/orders/' || v_order.id, false
    );
  END IF;

  RETURN jsonb_build_object(
    'already_refunded', false,
    'order_id', v_order.id,
    'refund_amount', v_total,
    'refund_channel', v_channel,
    'refund_reference', p_external_reference
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
  v_stock integer;
  v_quantity integer;
BEGIN
  IF NOT public.cp_is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) = 'paid' THEN
    RETURN jsonb_build_object('already_paid', true, 'order_id', v_order.id);
  END IF;

  v_method := lower(COALESCE(v_order.payment_method, 'manual'));
  IF v_method IN ('paypal', 'wallet') THEN
    RAISE EXCEPTION 'PayPal and wallet payments must use their own verified payment flow.';
  END IF;

  v_quantity := GREATEST(COALESCE(v_order.quantity, 1), 1);
  IF v_order.product_id IS NOT NULL THEN
    SELECT COALESCE(stock, 0) INTO v_stock
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
    escrow_status = 'holding',
    seller_payout_status = 'pending',
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

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

  UPDATE public.orders
  SET
    status = v_status,
    admin_note = COALESCE(v_note, admin_note),
    cancelled_at = CASE WHEN v_status = 'cancelled' THEN now() ELSE cancelled_at END,
    cancelled_by = CASE WHEN v_status = 'cancelled' THEN p_admin_id ELSE cancelled_by END,
    delivered_at = CASE WHEN v_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
    updated_at = now()
  WHERE id = p_order_id;

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

REVOKE ALL ON FUNCTION public.cp_is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cp_is_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cp_admin_finalize_order_refund(bigint, uuid, text, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_admin_finalize_order_refund(bigint, uuid, text, text, text)
TO service_role;
REVOKE ALL ON FUNCTION public.cp_admin_confirm_manual_payment(bigint, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_admin_confirm_manual_payment(bigint, uuid, text)
TO service_role;
REVOKE ALL ON FUNCTION public.cp_admin_override_order_status(bigint, uuid, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_admin_override_order_status(bigint, uuid, text, text)
TO service_role;

-- Promotion tables are publicly readable but never browser-mutable.
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.flash_sales ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.coupons FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.flash_sales FROM anon, authenticated;
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT SELECT ON public.flash_sales TO anon, authenticated;

DROP POLICY IF EXISTS cp_coupons_read ON public.coupons;
CREATE POLICY cp_coupons_read ON public.coupons
FOR SELECT USING (
  lower(COALESCE(status, 'inactive')) = 'active'
  OR public.cp_is_admin(auth.uid())
);

DROP POLICY IF EXISTS cp_flash_sales_read ON public.flash_sales;
CREATE POLICY cp_flash_sales_read ON public.flash_sales
FOR SELECT USING (
  lower(COALESCE(status, 'inactive')) = 'active'
  OR public.cp_is_admin(auth.uid())
);

-- Disputes: users may see and open their own disputes, but only server APIs
-- may update/resolve/delete them.
ALTER TABLE IF EXISTS public.disputes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.disputes TO authenticated;
REVOKE UPDATE, DELETE ON public.disputes FROM anon, authenticated;

DROP POLICY IF EXISTS cp_disputes_read ON public.disputes;
CREATE POLICY cp_disputes_read ON public.disputes
FOR SELECT TO authenticated
USING (
  buyer_id = auth.uid()
  OR seller_id = auth.uid()
  OR opened_by = auth.uid()
  OR public.cp_is_admin(auth.uid())
);

DROP POLICY IF EXISTS cp_disputes_open ON public.disputes;
CREATE POLICY cp_disputes_open ON public.disputes
FOR INSERT TO authenticated
WITH CHECK (
  opened_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  )
);

-- Support: ticket owners can read/create/update their own tickets and post
-- messages; admin moderation remains server-side and audited.
ALTER TABLE IF EXISTS public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
REVOKE DELETE ON public.support_tickets FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.support_ticket_messages FROM anon, authenticated;

DROP POLICY IF EXISTS cp_support_tickets_read ON public.support_tickets;
CREATE POLICY cp_support_tickets_read ON public.support_tickets
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.cp_is_admin(auth.uid()));

DROP POLICY IF EXISTS cp_support_tickets_insert ON public.support_tickets;
CREATE POLICY cp_support_tickets_insert ON public.support_tickets
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cp_support_tickets_owner_update ON public.support_tickets;
CREATE POLICY cp_support_tickets_owner_update ON public.support_tickets
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cp_support_messages_read ON public.support_ticket_messages;
CREATE POLICY cp_support_messages_read ON public.support_ticket_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND (t.user_id = auth.uid() OR public.cp_is_admin(auth.uid()))
  )
);

DROP POLICY IF EXISTS cp_support_messages_insert ON public.support_ticket_messages;
CREATE POLICY cp_support_messages_insert ON public.support_ticket_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id AND t.user_id = auth.uid()
  )
);

ALTER TABLE IF EXISTS public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_audit_logs TO authenticated;
DROP POLICY IF EXISTS cp_admin_audit_read ON public.admin_audit_logs;
CREATE POLICY cp_admin_audit_read ON public.admin_audit_logs
FOR SELECT TO authenticated
USING (public.cp_is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_orders_refunded_at ON public.orders(refunded_at);
CREATE INDEX IF NOT EXISTS idx_orders_refunded_by ON public.orders(refunded_by);
CREATE INDEX IF NOT EXISTS idx_orders_refund_reference ON public.orders(refund_reference);

COMMIT;

SELECT
  'comeplayers_security_boundary_v5_ready' AS status,
  (SELECT count(*) FROM public.coupons) AS coupons_count,
  (SELECT count(*) FROM public.flash_sales) AS flash_sales_count,
  (SELECT count(*) FROM public.disputes) AS disputes_count;
