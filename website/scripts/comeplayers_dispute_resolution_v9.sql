-- ComePlayers V9: Dispute Evidence & Resolution Center
-- Run after Security Boundary V5, Security Boundary V6, Stock Reservation V7,
-- and Seller Service Levels V8.

BEGIN;

CREATE TABLE IF NOT EXISTS public.disputes (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id uuid,
  seller_id uuid,
  opened_by uuid NOT NULL,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  admin_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS requested_resolution text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS original_order_status text,
  ADD COLUMN IF NOT EXISTS original_escrow_status text,
  ADD COLUMN IF NOT EXISTS response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS buyer_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.dispute_messages (
  id bigserial PRIMARY KEY,
  dispute_id bigint NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL DEFAULT 'participant',
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.dispute_evidence (
  id bigserial PRIMARY KEY,
  dispute_id bigint NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispute_events (
  id bigserial PRIMARY KEY,
  dispute_id bigint NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  old_status text,
  new_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_order_id
  ON public.disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_participants
  ON public.disputes(buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status_activity
  ON public.disputes(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute_created
  ON public.dispute_messages(dispute_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute_created
  ON public.dispute_evidence(dispute_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute_created
  ON public.dispute_events(dispute_id, created_at);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispute-evidence',
  'dispute-evidence',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/plain']
)
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.cp_open_dispute_v9(
  p_order_id bigint,
  p_actor_id uuid,
  p_reason text,
  p_description text,
  p_category text DEFAULT 'other',
  p_requested_resolution text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing_id bigint;
  v_dispute_id bigint;
  v_actor_role text;
  v_order_status text;
  v_payment_status text;
  v_escrow_status text;
  v_reason text;
  v_description text;
  v_category text;
  v_resolution text;
BEGIN
  v_reason := trim(COALESCE(p_reason, ''));
  v_description := trim(COALESCE(p_description, ''));
  v_category := lower(trim(COALESCE(p_category, 'other')));
  v_resolution := NULLIF(lower(trim(COALESCE(p_requested_resolution, ''))), '');

  IF v_reason = '' OR char_length(v_reason) < 5 OR char_length(v_reason) > 160 THEN
    RAISE EXCEPTION 'Dispute reason must be between 5 and 160 characters.';
  END IF;

  IF v_description = '' OR char_length(v_description) < 20 OR char_length(v_description) > 5000 THEN
    RAISE EXCEPTION 'Dispute description must be between 20 and 5000 characters.';
  END IF;

  IF v_category NOT IN (
    'item_not_received',
    'invalid_credentials',
    'item_not_as_described',
    'unauthorized_recovery',
    'payment_issue',
    'seller_issue',
    'buyer_issue',
    'other'
  ) THEN
    RAISE EXCEPTION 'Unsupported dispute category.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id = p_actor_id THEN
    v_actor_role := 'buyer';
  ELSIF v_order.seller_id = p_actor_id THEN
    v_actor_role := 'seller';
  ELSE
    RAISE EXCEPTION 'You are not allowed to dispute this order.';
  END IF;

  v_order_status := lower(COALESCE(v_order.status, ''));
  v_payment_status := lower(COALESCE(v_order.payment_status, ''));
  v_escrow_status := lower(COALESCE(v_order.escrow_status, ''));

  IF v_payment_status <> 'paid'
     AND v_order_status NOT IN ('paid', 'processing', 'delivered', 'disputed') THEN
    RAISE EXCEPTION 'Only paid marketplace orders can be disputed.';
  END IF;

  IF v_order_status IN ('completed', 'cancelled', 'refunded', 'expired')
     OR v_escrow_status IN ('released', 'refunded') THEN
    RAISE EXCEPTION 'This order is no longer eligible for a dispute.';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.disputes
  WHERE order_id = p_order_id
    AND lower(COALESCE(status, 'open')) IN (
      'open',
      'investigating',
      'awaiting_buyer',
      'awaiting_seller'
    )
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'dispute_id', v_existing_id,
      'existing', true
    );
  END IF;

  INSERT INTO public.disputes (
    order_id,
    buyer_id,
    seller_id,
    opened_by,
    reason,
    description,
    category,
    requested_resolution,
    priority,
    status,
    original_order_status,
    original_escrow_status,
    response_due_at,
    last_activity_at,
    updated_at
  ) VALUES (
    p_order_id,
    v_order.buyer_id,
    v_order.seller_id,
    p_actor_id,
    v_reason,
    v_description,
    v_category,
    v_resolution,
    CASE WHEN v_order_status = 'delivered' THEN 'high' ELSE 'normal' END,
    'open',
    v_order.status,
    v_order.escrow_status,
    now() + interval '24 hours',
    now(),
    now()
  )
  RETURNING id INTO v_dispute_id;

  UPDATE public.orders
  SET
    status = 'disputed',
    escrow_status = 'disputed',
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.dispute_messages (
    dispute_id,
    sender_id,
    sender_role,
    message,
    is_internal
  ) VALUES (
    v_dispute_id,
    p_actor_id,
    v_actor_role,
    v_description,
    false
  );

  INSERT INTO public.dispute_events (
    dispute_id,
    actor_id,
    event_type,
    old_status,
    new_status,
    note,
    metadata
  ) VALUES (
    v_dispute_id,
    p_actor_id,
    'dispute_opened',
    NULL,
    'open',
    v_reason,
    jsonb_build_object(
      'order_id', p_order_id,
      'category', v_category,
      'requested_resolution', v_resolution,
      'actor_role', v_actor_role
    )
  );

  RETURN jsonb_build_object(
    'dispute_id', v_dispute_id,
    'existing', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cp_open_dispute_v9(bigint, uuid, text, text, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_open_dispute_v9(bigint, uuid, text, text, text, text)
TO service_role;

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.disputes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dispute_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dispute_evidence FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dispute_events FROM anon, authenticated;

GRANT SELECT ON public.disputes TO authenticated;
GRANT SELECT ON public.dispute_messages TO authenticated;
GRANT SELECT ON public.dispute_evidence TO authenticated;
GRANT SELECT ON public.dispute_events TO authenticated;

DROP POLICY IF EXISTS cp_disputes_open ON public.disputes;
DROP POLICY IF EXISTS cp_disputes_read ON public.disputes;
CREATE POLICY cp_disputes_read ON public.disputes
FOR SELECT TO authenticated
USING (
  buyer_id = auth.uid()
  OR seller_id = auth.uid()
  OR opened_by = auth.uid()
  OR public.cp_is_admin(auth.uid())
);

DROP POLICY IF EXISTS cp_dispute_messages_read ON public.dispute_messages;
CREATE POLICY cp_dispute_messages_read ON public.dispute_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.disputes d
    WHERE d.id = dispute_id
      AND (
        public.cp_is_admin(auth.uid())
        OR (
          is_internal = false
          AND (
            d.buyer_id = auth.uid()
            OR d.seller_id = auth.uid()
            OR d.opened_by = auth.uid()
          )
        )
      )
  )
);

DROP POLICY IF EXISTS cp_dispute_evidence_read ON public.dispute_evidence;
CREATE POLICY cp_dispute_evidence_read ON public.dispute_evidence
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.disputes d
    WHERE d.id = dispute_id
      AND (
        d.buyer_id = auth.uid()
        OR d.seller_id = auth.uid()
        OR d.opened_by = auth.uid()
        OR public.cp_is_admin(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS cp_dispute_events_read ON public.dispute_events;
CREATE POLICY cp_dispute_events_read ON public.dispute_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.disputes d
    WHERE d.id = dispute_id
      AND (
        d.buyer_id = auth.uid()
        OR d.seller_id = auth.uid()
        OR d.opened_by = auth.uid()
        OR public.cp_is_admin(auth.uid())
      )
  )
);

COMMIT;

SELECT 'comeplayers_dispute_resolution_v9_ready' AS result;
