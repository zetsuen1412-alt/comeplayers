BEGIN;

CREATE OR REPLACE FUNCTION public.create_marketplace_order_doku_v1(
  p_buyer_id uuid,
  p_product_id bigint,
  p_variant_id bigint DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_coupon_code text DEFAULT NULL,
  p_reservation_minutes integer DEFAULT 55
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
  v_result := public.create_marketplace_order_v13(
    p_buyer_id,
    p_product_id,
    p_variant_id,
    p_quantity,
    'wallet',
    p_coupon_code,
    0,
    p_reservation_minutes
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

CREATE OR REPLACE FUNCTION public.finalize_doku_order_payment(
  p_order_id bigint,
  p_invoice_number text,
  p_request_id text,
  p_channel_id text,
  p_amount_idr numeric,
  p_payment_proof text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_expected_total numeric;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF NULLIF(btrim(COALESCE(p_invoice_number, '')), '') IS NULL
    OR v_order.invoice_number IS DISTINCT FROM p_invoice_number THEN
    RAISE EXCEPTION 'DOKU invoice number mismatch.';
  END IF;

  v_expected_total := COALESCE(
    NULLIF(v_order.total_amount, 0),
    NULLIF(v_order.total_price, 0),
    NULLIF(
      regexp_replace(COALESCE(v_order.price::text, ''), '[^0-9.]', '', 'g'),
      ''
    )::numeric,
    0
  );

  IF v_expected_total <= 0
    OR p_amount_idr IS NULL
    OR p_amount_idr <> v_expected_total THEN
    RAISE EXCEPTION 'DOKU payment amount mismatch.';
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) = 'paid'
    OR lower(COALESCE(v_order.status, '')) IN ('paid', 'delivered', 'completed') THEN
    IF lower(COALESCE(v_order.payment_method, '')) <> 'doku' THEN
      RAISE EXCEPTION 'Order was already paid with another payment method.';
    END IF;

    RETURN jsonb_build_object(
      'already_paid', true,
      'buyer_id', v_order.buyer_id,
      'seller_id', v_order.seller_id,
      'order_id', v_order.id,
      'request_id', p_request_id,
      'channel_id', p_channel_id
    );
  END IF;

  IF lower(COALESCE(v_order.status, '')) IN ('cancelled', 'expired', 'refunded') THEN
    RAISE EXCEPTION 'Order can no longer be paid.';
  END IF;

  IF v_order.buyer_id IS NULL THEN
    RAISE EXCEPTION 'Order buyer is missing.';
  END IF;

  PERFORM public.cp_consume_order_reservation(v_order.id, v_order.buyer_id);

  UPDATE public.orders
  SET
    status = 'paid',
    payment_status = 'paid',
    payment_method = 'doku',
    payment_proof = p_payment_proof,
    escrow_status = 'holding',
    seller_payout_status = 'pending',
    reservation_status = 'consumed',
    paid_at = COALESCE(paid_at, now()),
    updated_at = now()
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'already_paid', false,
    'buyer_id', v_order.buyer_id,
    'seller_id', v_order.seller_id,
    'order_id', v_order.id,
    'request_id', p_request_id,
    'channel_id', p_channel_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order_doku_v1(
  uuid, bigint, bigint, integer, text, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_doku_order_payment(
  bigint, text, text, text, numeric, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_marketplace_order_doku_v1(
  uuid, bigint, bigint, integer, text, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_doku_order_payment(
  bigint, text, text, text, numeric, text
) TO service_role;

COMMIT;

SELECT 'comeplayers_doku_checkout_v35_ready' AS status;
