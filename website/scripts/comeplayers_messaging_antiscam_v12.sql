-- ComePlayers V12: Order Messaging, Private Attachments, and Anti-Scam Moderation
-- Run after Trust, Risk & Account Security V11.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  product_id bigint,
  order_id bigint,
  room_type text NOT NULL DEFAULT 'product',
  status text NOT NULL DEFAULT 'active',
  last_message text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS buyer_id uuid,
  ADD COLUMN IF NOT EXISTS seller_id uuid,
  ADD COLUMN IF NOT EXISTS product_id bigint,
  ADD COLUMN IF NOT EXISTS order_id bigint,
  ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_message text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_sender_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.chat_rooms
SET
  room_type = CASE WHEN order_id IS NOT NULL THEN 'order' ELSE 'product' END,
  status = COALESCE(NULLIF(status, ''), 'active'),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE room_type IS NULL OR room_type = '' OR status IS NULL OR status = '' OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_rooms_buyer_activity_idx
  ON public.chat_rooms(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS chat_rooms_seller_activity_idx
  ON public.chat_rooms(seller_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS chat_rooms_order_idx
  ON public.chat_rooms(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_rooms_product_participants_idx
  ON public.chat_rooms(product_id, buyer_id, seller_id) WHERE product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  message text,
  message_type text NOT NULL DEFAULT 'text',
  attachment_id bigint,
  moderation_status text NOT NULL DEFAULT 'clean',
  risk_score integer NOT NULL DEFAULT 0,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS room_id uuid,
  ADD COLUMN IF NOT EXISTS sender_id uuid,
  ADD COLUMN IF NOT EXISTS receiver_id uuid,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS attachment_id bigint,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.chat_messages
SET
  message_type = COALESCE(NULLIF(message_type, ''), 'text'),
  moderation_status = COALESCE(NULLIF(moderation_status, ''), 'clean'),
  risk_score = COALESCE(risk_score, 0),
  risk_flags = COALESCE(risk_flags, '[]'::jsonb),
  is_read = COALESCE(is_read, false)
WHERE message_type IS NULL
   OR moderation_status IS NULL
   OR risk_score IS NULL
   OR risk_flags IS NULL
   OR is_read IS NULL;

CREATE INDEX IF NOT EXISTS chat_messages_room_created_idx
  ON public.chat_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_receiver_unread_idx
  ON public.chat_messages(receiver_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_moderation_idx
  ON public.chat_messages(moderation_status, risk_score DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL,
  message_id uuid,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  moderation_status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.chat_attachments
  ADD COLUMN IF NOT EXISTS room_id uuid,
  ADD COLUMN IF NOT EXISTS message_id uuid,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS chat_attachments_room_created_idx
  ON public.chat_attachments(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON public.chat_attachments(message_id) WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_moderation_events (
  id bigserial PRIMARY KEY,
  room_id uuid,
  message_id uuid,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  risk_score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  redacted_excerpt text,
  status text NOT NULL DEFAULT 'open',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_moderation_events_queue_idx
  ON public.chat_moderation_events(status, risk_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_moderation_events_user_idx
  ON public.chat_moderation_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_reports (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL,
  message_id uuid NOT NULL,
  reported_by uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  reviewed_by uuid,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_reports_reporter_message_idx
  ON public.chat_reports(reported_by, message_id);
CREATE INDEX IF NOT EXISTS chat_reports_queue_idx
  ON public.chat_reports(status, created_at DESC);

ALTER TABLE public.user_account_settings
  ADD COLUMN IF NOT EXISTS chat_suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS chat_suspension_reason text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments-private',
  'chat-attachments-private',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.cp_get_or_create_chat_room_v12(
  p_actor_id uuid,
  p_seller_id uuid DEFAULT NULL,
  p_product_id bigint DEFAULT NULL,
  p_order_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_product record;
  v_buyer_id uuid;
  v_seller_id uuid;
  v_product_id bigint;
  v_room_id text;
  v_room_type text;
  v_lock_key text;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required.';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order.buyer_id IS NULL OR v_order.seller_id IS NULL THEN
      RAISE EXCEPTION 'Order participants are incomplete.';
    END IF;

    IF p_actor_id <> v_order.buyer_id AND p_actor_id <> v_order.seller_id THEN
      RAISE EXCEPTION 'You are not allowed to open this order conversation.';
    END IF;

    v_buyer_id := v_order.buyer_id;
    v_seller_id := v_order.seller_id;
    v_product_id := v_order.product_id;
    v_room_type := 'order';
    v_lock_key := 'chat-order-' || p_order_id::text;
  ELSIF p_product_id IS NOT NULL THEN
    SELECT id, seller_id INTO v_product
    FROM public.products
    WHERE id = p_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found.';
    END IF;

    IF v_product.seller_id IS NULL THEN
      RAISE EXCEPTION 'Product seller is unavailable.';
    END IF;

    IF p_seller_id IS NOT NULL AND p_seller_id <> v_product.seller_id THEN
      RAISE EXCEPTION 'Seller does not match the selected product.';
    END IF;

    IF p_actor_id = v_product.seller_id THEN
      RAISE EXCEPTION 'You cannot start a buyer chat with yourself.';
    END IF;

    v_buyer_id := p_actor_id;
    v_seller_id := v_product.seller_id;
    v_product_id := p_product_id;
    v_room_type := 'product';
    v_lock_key := 'chat-product-' || p_product_id::text || '-' || p_actor_id::text;
  ELSE
    RAISE EXCEPTION 'A product or order is required to start a conversation.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

  IF p_order_id IS NOT NULL THEN
    SELECT id::text INTO v_room_id
    FROM public.chat_rooms
    WHERE order_id = p_order_id
      AND buyer_id = v_buyer_id
      AND seller_id = v_seller_id
    ORDER BY created_at ASC
    LIMIT 1;
  ELSE
    SELECT id::text INTO v_room_id
    FROM public.chat_rooms
    WHERE order_id IS NULL
      AND product_id = v_product_id
      AND buyer_id = v_buyer_id
      AND seller_id = v_seller_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_room_id IS NULL THEN
    INSERT INTO public.chat_rooms (
      buyer_id,
      seller_id,
      product_id,
      order_id,
      room_type,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_buyer_id,
      v_seller_id,
      v_product_id,
      p_order_id,
      v_room_type,
      'active',
      now(),
      now()
    )
    RETURNING id::text INTO v_room_id;
  ELSE
    UPDATE public.chat_rooms
    SET
      product_id = COALESCE(product_id, v_product_id),
      room_type = v_room_type,
      updated_at = now()
    WHERE id::text = v_room_id;
  END IF;

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'buyer_id', v_buyer_id,
    'seller_id', v_seller_id,
    'product_id', v_product_id,
    'order_id', p_order_id,
    'room_type', v_room_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cp_get_or_create_chat_room_v12(uuid, uuid, bigint, bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_get_or_create_chat_room_v12(uuid, uuid, bigint, bigint)
TO service_role;

-- Remove old browser policies before installing participant-only reads.
DO $$
DECLARE
  policy_row record;
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'chat_rooms',
    'chat_messages',
    'chat_attachments',
    'chat_moderation_events',
    'chat_reports'
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

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY cp_chat_rooms_participant_read ON public.chat_rooms
FOR SELECT TO authenticated
USING (
  buyer_id = auth.uid()
  OR seller_id = auth.uid()
  OR public.cp_is_admin(auth.uid())
);

CREATE POLICY cp_chat_messages_participant_read ON public.chat_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_rooms room
    WHERE room.id = chat_messages.room_id
      AND (
        room.buyer_id = auth.uid()
        OR room.seller_id = auth.uid()
        OR public.cp_is_admin(auth.uid())
      )
  )
);

-- Attachment metadata and moderation data are served through protected APIs.
REVOKE ALL ON public.chat_attachments FROM anon, authenticated;
REVOKE ALL ON public.chat_moderation_events FROM anon, authenticated;
REVOKE ALL ON public.chat_reports FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.chat_rooms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_messages FROM anon, authenticated;
GRANT SELECT ON public.chat_rooms TO authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;

GRANT ALL ON public.chat_rooms TO service_role;
GRANT ALL ON public.chat_messages TO service_role;
GRANT ALL ON public.chat_attachments TO service_role;
GRANT ALL ON public.chat_moderation_events TO service_role;
GRANT ALL ON public.chat_reports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.chat_attachments_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.chat_moderation_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.chat_reports_id_seq TO service_role;

COMMIT;

SELECT
  'comeplayers_messaging_antiscam_v12_ready' AS status,
  (SELECT count(*) FROM public.chat_rooms) AS rooms_count,
  (SELECT count(*) FROM public.chat_messages) AS messages_count,
  (SELECT count(*) FROM public.chat_moderation_events) AS moderation_events_count;
