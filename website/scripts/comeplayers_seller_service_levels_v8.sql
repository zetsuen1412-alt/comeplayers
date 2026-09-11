-- ComePlayers V8: Seller Service Levels, Presence, and Delivery SLA
-- Run after Transaction Core V2.1 + Foundation V3 + Security V4/V5/V6 + Stock Reservation V7.
-- Additive and idempotent. It does not delete marketplace data.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seller_presence_mode text DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS seller_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_delivery_sla_minutes integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS seller_avg_delivery_minutes numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_on_time_rate numeric DEFAULT 100,
  ADD COLUMN IF NOT EXISTS seller_total_deliveries integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_late_deliveries integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_service_level text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS seller_service_metrics_updated_at timestamptz;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_eta_minutes integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_sla_minutes integer,
  ADD COLUMN IF NOT EXISTS delivery_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_late_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_sla_status text DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS seller_service_level_snapshot text;

UPDATE public.profiles
SET
  seller_presence_mode = CASE
    WHEN lower(COALESCE(seller_presence_mode, '')) IN ('online', 'away', 'offline')
      THEN lower(seller_presence_mode)
    ELSE 'offline'
  END,
  seller_delivery_sla_minutes = GREATEST(
    15,
    LEAST(COALESCE(seller_delivery_sla_minutes, 60), 10080)
  ),
  seller_avg_delivery_minutes = GREATEST(COALESCE(seller_avg_delivery_minutes, 0), 0),
  seller_on_time_rate = GREATEST(0, LEAST(COALESCE(seller_on_time_rate, 100), 100)),
  seller_total_deliveries = GREATEST(COALESCE(seller_total_deliveries, 0), 0),
  seller_late_deliveries = GREATEST(COALESCE(seller_late_deliveries, 0), 0),
  seller_service_level = COALESCE(NULLIF(lower(seller_service_level), ''), 'new');

UPDATE public.products
SET delivery_eta_minutes = NULL
WHERE delivery_eta_minutes IS NOT NULL
  AND (delivery_eta_minutes < 15 OR delivery_eta_minutes > 10080);

CREATE INDEX IF NOT EXISTS idx_profiles_seller_presence
  ON public.profiles(seller_presence_mode, seller_last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_delivery_due_pending
  ON public.orders(delivery_due_at)
  WHERE delivered_at IS NULL
    AND delivery_due_at IS NOT NULL
    AND lower(COALESCE(payment_status, '')) = 'paid';

CREATE INDEX IF NOT EXISTS idx_orders_seller_delivery_metrics
  ON public.orders(seller_id, delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cp_calculate_seller_service_level(
  p_total_deliveries integer,
  p_on_time_rate numeric,
  p_avg_delivery_minutes numeric
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_total_deliveries, 0) < 5 THEN 'new'
    WHEN COALESCE(p_total_deliveries, 0) >= 100
      AND COALESCE(p_on_time_rate, 0) >= 98
      AND COALESCE(p_avg_delivery_minutes, 999999) <= 120 THEN 'elite'
    WHEN COALESCE(p_total_deliveries, 0) >= 30
      AND COALESCE(p_on_time_rate, 0) >= 95
      AND COALESCE(p_avg_delivery_minutes, 999999) <= 240 THEN 'trusted'
    WHEN COALESCE(p_total_deliveries, 0) >= 10
      AND COALESCE(p_on_time_rate, 0) >= 90 THEN 'reliable'
    ELSE 'standard'
  END;
$$;

CREATE OR REPLACE FUNCTION public.cp_refresh_seller_delivery_metrics(
  p_seller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_late integer := 0;
  v_avg_minutes numeric := 0;
  v_on_time_rate numeric := 100;
  v_level text := 'new';
BEGIN
  IF p_seller_id IS NULL THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'missing_seller_id');
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE delivery_due_at IS NOT NULL
        AND delivered_at > delivery_due_at
    )::integer,
    COALESCE(
      avg(
        GREATEST(
          extract(epoch FROM (delivered_at - COALESCE(paid_at, created_at))) / 60.0,
          0
        )
      ),
      0
    )
  INTO v_total, v_late, v_avg_minutes
  FROM public.orders
  WHERE seller_id = p_seller_id
    AND delivered_at IS NOT NULL
    AND lower(COALESCE(payment_status, '')) = 'paid'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'expired', 'refunded');

  IF v_total > 0 THEN
    v_on_time_rate := round(((v_total - v_late)::numeric / v_total::numeric) * 100, 2);
  END IF;

  v_avg_minutes := round(COALESCE(v_avg_minutes, 0), 2);
  v_level := public.cp_calculate_seller_service_level(
    v_total,
    v_on_time_rate,
    v_avg_minutes
  );

  UPDATE public.profiles
  SET
    seller_total_deliveries = v_total,
    seller_late_deliveries = v_late,
    seller_avg_delivery_minutes = v_avg_minutes,
    seller_on_time_rate = v_on_time_rate,
    seller_service_level = v_level,
    seller_service_metrics_updated_at = now()
  WHERE id = p_seller_id;

  RETURN jsonb_build_object(
    'updated', true,
    'seller_id', p_seller_id,
    'total_deliveries', v_total,
    'late_deliveries', v_late,
    'average_delivery_minutes', v_avg_minutes,
    'on_time_rate', v_on_time_rate,
    'service_level', v_level
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_apply_order_delivery_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_should_initialize boolean := false;
  v_sla integer := 60;
  v_level text := 'new';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should_initialize := lower(COALESCE(NEW.payment_status, '')) = 'paid';
  ELSE
    v_should_initialize :=
      lower(COALESCE(NEW.payment_status, '')) = 'paid'
      AND (
        lower(COALESCE(OLD.payment_status, '')) <> 'paid'
        OR OLD.delivery_due_at IS NULL
      );
  END IF;

  IF v_should_initialize AND NEW.seller_id IS NOT NULL THEN
    SELECT
      GREATEST(
        15,
        LEAST(
          COALESCE(
            NULLIF((SELECT delivery_eta_minutes FROM public.products WHERE id = NEW.product_id), 0),
            NULLIF((SELECT seller_delivery_sla_minutes FROM public.profiles WHERE id = NEW.seller_id), 0),
            60
          ),
          10080
        )
      ),
      COALESCE(
        NULLIF((SELECT seller_service_level FROM public.profiles WHERE id = NEW.seller_id), ''),
        'new'
      )
    INTO v_sla, v_level;

    NEW.delivery_sla_minutes := COALESCE(NEW.delivery_sla_minutes, v_sla);
    NEW.delivery_due_at := COALESCE(
      NEW.delivery_due_at,
      COALESCE(NEW.paid_at, now()) + make_interval(mins => v_sla)
    );
    NEW.delivery_sla_status := CASE
      WHEN NEW.delivered_at IS NOT NULL AND NEW.delivery_due_at IS NOT NULL
        AND NEW.delivered_at > NEW.delivery_due_at THEN 'completed_late'
      WHEN NEW.delivered_at IS NOT NULL THEN 'completed_on_time'
      ELSE 'pending'
    END;
    NEW.seller_service_level_snapshot := COALESCE(
      NULLIF(NEW.seller_service_level_snapshot, ''),
      v_level
    );
  END IF;

  IF NEW.delivered_at IS NOT NULL THEN
    IF NEW.delivery_due_at IS NOT NULL AND NEW.delivered_at > NEW.delivery_due_at THEN
      NEW.delivery_sla_status := 'completed_late';
      NEW.delivery_late_at := COALESCE(NEW.delivery_late_at, NEW.delivery_due_at, now());
    ELSE
      NEW.delivery_sla_status := 'completed_on_time';
    END IF;
  ELSIF NEW.delivery_due_at IS NOT NULL
    AND lower(COALESCE(NEW.payment_status, '')) = 'paid'
    AND now() > NEW.delivery_due_at THEN
    NEW.delivery_sla_status := 'late';
    NEW.delivery_late_at := COALESCE(NEW.delivery_late_at, NEW.delivery_due_at);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cp_apply_order_delivery_sla ON public.orders;
CREATE TRIGGER trg_cp_apply_order_delivery_sla
BEFORE INSERT OR UPDATE OF payment_status, paid_at, delivered_at, status, delivery_due_at
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.cp_apply_order_delivery_sla();

CREATE OR REPLACE FUNCTION public.cp_refresh_seller_metrics_after_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.seller_id IS NOT NULL
    AND NEW.delivered_at IS NOT NULL
    AND (
      TG_OP = 'INSERT'
      OR OLD.delivered_at IS DISTINCT FROM NEW.delivered_at
    ) THEN
    PERFORM public.cp_refresh_seller_delivery_metrics(NEW.seller_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cp_refresh_seller_metrics_after_delivery ON public.orders;
CREATE TRIGGER trg_cp_refresh_seller_metrics_after_delivery
AFTER INSERT OR UPDATE OF delivered_at
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.cp_refresh_seller_metrics_after_delivery();

CREATE OR REPLACE FUNCTION public.cp_mark_late_delivery_orders(
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  order_id bigint,
  buyer_id uuid,
  seller_id uuid,
  delivery_due_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.orders o
    WHERE lower(COALESCE(o.payment_status, '')) = 'paid'
      AND lower(COALESCE(o.status, '')) IN ('paid', 'processing')
      AND o.delivered_at IS NULL
      AND o.delivery_due_at IS NOT NULL
      AND o.delivery_due_at <= now()
      AND lower(COALESCE(o.delivery_sla_status, '')) NOT IN ('late', 'completed_late')
    ORDER BY o.delivery_due_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.orders o
  SET
    delivery_sla_status = 'late',
    delivery_late_at = COALESCE(o.delivery_late_at, o.delivery_due_at, now()),
    updated_at = now()
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.id, o.buyer_id, o.seller_id, o.delivery_due_at;
END;
$$;

-- Backfill SLA snapshots for existing paid orders.
UPDATE public.orders o
SET
  delivery_sla_minutes = COALESCE(
    o.delivery_sla_minutes,
    NULLIF((SELECT p.delivery_eta_minutes FROM public.products p WHERE p.id = o.product_id), 0),
    NULLIF((SELECT pr.seller_delivery_sla_minutes FROM public.profiles pr WHERE pr.id = o.seller_id), 0),
    60
  ),
  delivery_due_at = COALESCE(
    o.delivery_due_at,
    COALESCE(o.paid_at, o.created_at, now()) + make_interval(
      mins => GREATEST(
        15,
        LEAST(
          COALESCE(
            o.delivery_sla_minutes,
            NULLIF((SELECT p.delivery_eta_minutes FROM public.products p WHERE p.id = o.product_id), 0),
            NULLIF((SELECT pr.seller_delivery_sla_minutes FROM public.profiles pr WHERE pr.id = o.seller_id), 0),
            60
          ),
          10080
        )
      )
    )
  ),
  seller_service_level_snapshot = COALESCE(
    NULLIF(o.seller_service_level_snapshot, ''),
    NULLIF((SELECT pr.seller_service_level FROM public.profiles pr WHERE pr.id = o.seller_id), ''),
    'new'
  )
WHERE lower(COALESCE(o.payment_status, '')) = 'paid'
  AND o.seller_id IS NOT NULL;

UPDATE public.orders
SET
  delivery_sla_status = CASE
    WHEN delivered_at IS NOT NULL AND delivery_due_at IS NOT NULL AND delivered_at > delivery_due_at
      THEN 'completed_late'
    WHEN delivered_at IS NOT NULL THEN 'completed_on_time'
    WHEN delivery_due_at IS NOT NULL AND delivery_due_at <= now() THEN 'late'
    WHEN delivery_due_at IS NOT NULL THEN 'pending'
    ELSE COALESCE(NULLIF(delivery_sla_status, ''), 'not_started')
  END,
  delivery_late_at = CASE
    WHEN delivered_at IS NOT NULL AND delivery_due_at IS NOT NULL AND delivered_at > delivery_due_at
      THEN COALESCE(delivery_late_at, delivery_due_at)
    WHEN delivered_at IS NULL AND delivery_due_at IS NOT NULL AND delivery_due_at <= now()
      THEN COALESCE(delivery_late_at, delivery_due_at)
    ELSE delivery_late_at
  END
WHERE lower(COALESCE(payment_status, '')) = 'paid';

DO $$
DECLARE
  seller_row record;
BEGIN
  FOR seller_row IN
    SELECT DISTINCT seller_id
    FROM public.orders
    WHERE seller_id IS NOT NULL
  LOOP
    PERFORM public.cp_refresh_seller_delivery_metrics(seller_row.seller_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.cp_refresh_seller_delivery_metrics(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_mark_late_delivery_orders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_refresh_seller_delivery_metrics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_mark_late_delivery_orders(integer) TO service_role;

COMMIT;

SELECT
  'comeplayers_seller_service_levels_v8_ready' AS migration_status,
  (SELECT count(*) FROM public.profiles WHERE seller_status = 'approved') AS approved_sellers,
  (SELECT count(*) FROM public.orders WHERE delivery_due_at IS NOT NULL) AS orders_with_sla;
