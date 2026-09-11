-- ComePlayers V23.4 - checkout coupon record safety fix.
-- Run after V23.3. This patch is idempotent and only updates the V13
-- checkout helper so orders without coupons never read an unassigned record.

BEGIN;

DO $$
DECLARE
  v_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_marketplace_order_v13(uuid,bigint,bigint,integer,text,text,numeric,integer)'::regprocedure
  )
  INTO v_sql;

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'create_marketplace_order_v13 function is missing.';
  END IF;

  IF v_sql NOT LIKE '%v_coupon_id bigint := NULL;%' THEN
    v_sql := replace(
      v_sql,
      $patch$v_coupon_code text;
  v_expires_at$patch$,
      $patch$v_coupon_code text;
  v_coupon_id bigint := NULL;
  v_expires_at$patch$
    );

    v_sql := replace(
      v_sql,
      $patch$    v_discount := LEAST(v_subtotal, GREATEST(0, v_discount));
  END IF;$patch$,
      $patch$    v_discount := LEAST(v_subtotal, GREATEST(0, v_discount));
    v_coupon_id := v_coupon.id;
  END IF;$patch$
    );
  END IF;

  v_sql := replace(
    v_sql,
    $patch$CASE WHEN v_coupon_code IS NOT NULL THEN v_coupon.id ELSE NULL END,$patch$,
    $patch$v_coupon_id,$patch$
  );
  v_sql := replace(v_sql, 'WHERE id = v_coupon.id;', 'WHERE id = v_coupon_id;');
  v_sql := replace(v_sql, 'v_coupon.id, p_buyer_id', 'v_coupon_id, p_buyer_id');

  IF v_sql NOT LIKE '%v_coupon_id bigint := NULL;%' THEN
    RAISE EXCEPTION 'V23.4 patch failed to add v_coupon_id declaration.';
  END IF;
  IF v_sql NOT LIKE '%v_coupon_id := v_coupon.id;%' THEN
    RAISE EXCEPTION 'V23.4 patch failed to assign v_coupon_id.';
  END IF;
  IF v_sql LIKE '%CASE WHEN v_coupon_code IS NOT NULL THEN v_coupon.id%' THEN
    RAISE EXCEPTION 'V23.4 patch failed to replace coupon_id insert expression.';
  END IF;
  IF v_sql LIKE '%WHERE id = v_coupon.id%' THEN
    RAISE EXCEPTION 'V23.4 patch failed to replace coupon update expression.';
  END IF;

  EXECUTE v_sql;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_order_v13(uuid, bigint, bigint, integer, text, text, numeric, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order_v13(uuid, bigint, bigint, integer, text, text, numeric, integer)
  TO service_role;

COMMIT;

SELECT 'comeplayers_checkout_coupon_record_fix_v23_4_ready' AS status;
