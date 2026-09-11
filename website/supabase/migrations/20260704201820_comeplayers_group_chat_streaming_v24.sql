-- ComePlayers V24: Community group chat and group-only live streaming.
-- Adds Discord-style group rooms on top of the existing buyer/seller
-- protected messaging system. Live streaming uses browser WebRTC with
-- Supabase Realtime Broadcast/Presence for signaling.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS stream_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS stream_host_id uuid,
  ADD COLUMN IF NOT EXISTS stream_title text,
  ADD COLUMN IF NOT EXISTS stream_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_updated_at timestamptz;

UPDATE public.chat_rooms
SET
  stream_status = COALESCE(NULLIF(stream_status, ''), 'idle'),
  stream_updated_at = COALESCE(stream_updated_at, updated_at, created_at, now())
WHERE stream_status IS NULL
   OR stream_status = ''
   OR stream_updated_at IS NULL;

CREATE INDEX IF NOT EXISTS chat_rooms_type_activity_v24_idx
  ON public.chat_rooms(room_type, last_message_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_rooms_stream_live_v24_idx
  ON public.chat_rooms(stream_status, stream_updated_at DESC)
  WHERE stream_status = 'live';

CREATE TABLE IF NOT EXISTS public.chat_room_members (
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_read_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE public.chat_room_members
  ADD COLUMN IF NOT EXISTS member_role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS chat_room_members_user_activity_v24_idx
  ON public.chat_room_members(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_room_members_room_role_v24_idx
  ON public.chat_room_members(room_id, status, member_role);

INSERT INTO public.chat_room_members (
  room_id,
  user_id,
  member_role,
  status,
  joined_at,
  updated_at,
  last_read_at
)
SELECT
  room.id,
  room.buyer_id,
  'buyer',
  'active',
  COALESCE(room.created_at, now()),
  now(),
  COALESCE(room.last_message_at, room.created_at, now())
FROM public.chat_rooms room
WHERE room.buyer_id IS NOT NULL
ON CONFLICT (room_id, user_id) DO NOTHING;

INSERT INTO public.chat_room_members (
  room_id,
  user_id,
  member_role,
  status,
  joined_at,
  updated_at,
  last_read_at
)
SELECT
  room.id,
  room.seller_id,
  'seller',
  'active',
  COALESCE(room.created_at, now()),
  now(),
  COALESCE(room.last_message_at, room.created_at, now())
FROM public.chat_rooms room
WHERE room.seller_id IS NOT NULL
ON CONFLICT (room_id, user_id) DO NOTHING;

DROP POLICY IF EXISTS cp_chat_rooms_participant_read ON public.chat_rooms;
DROP POLICY IF EXISTS cp_chat_messages_participant_read ON public.chat_messages;

ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_chat_room_members_self_read ON public.chat_room_members;
CREATE POLICY cp_chat_room_members_self_read ON public.chat_room_members
FOR SELECT TO authenticated
USING (
  user_id = (select auth.uid())
  OR public.cp_is_admin((select auth.uid()))
);

CREATE POLICY cp_chat_rooms_participant_read ON public.chat_rooms
FOR SELECT TO authenticated
USING (
  buyer_id = (select auth.uid())
  OR seller_id = (select auth.uid())
  OR public.cp_is_admin((select auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.chat_room_members member
    WHERE member.room_id = chat_rooms.id
      AND member.user_id = (select auth.uid())
      AND member.status = 'active'
  )
);

CREATE POLICY cp_chat_messages_participant_read ON public.chat_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_rooms room
    WHERE room.id = chat_messages.room_id
      AND (
        room.buyer_id = (select auth.uid())
        OR room.seller_id = (select auth.uid())
        OR public.cp_is_admin((select auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.chat_room_members member
          WHERE member.room_id = room.id
            AND member.user_id = (select auth.uid())
            AND member.status = 'active'
        )
      )
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.chat_room_members FROM anon, authenticated;
GRANT SELECT ON public.chat_room_members TO authenticated;
GRANT ALL ON public.chat_room_members TO service_role;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS cp_group_stream_realtime_read_v24 ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS cp_group_stream_realtime_write_v24 ON realtime.messages';

    EXECUTE $policy$
      CREATE POLICY cp_group_stream_realtime_read_v24 ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1
          FROM public.chat_room_members member
          WHERE member.user_id = (select auth.uid())
            AND member.status = 'active'
            AND member.room_id = (
              CASE
                WHEN (select realtime.topic()) ~ '^group-stream:[0-9a-fA-F-]{36}$'
                  THEN split_part((select realtime.topic()), ':', 2)::uuid
                ELSE NULL::uuid
              END
            )
        )
      )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY cp_group_stream_realtime_write_v24 ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1
          FROM public.chat_room_members member
          WHERE member.user_id = (select auth.uid())
            AND member.status = 'active'
            AND member.room_id = (
              CASE
                WHEN (select realtime.topic()) ~ '^group-stream:[0-9a-fA-F-]{36}$'
                  THEN split_part((select realtime.topic()), ':', 2)::uuid
                ELSE NULL::uuid
              END
            )
        )
      )
    $policy$;
  END IF;
END;
$$;

COMMIT;

SELECT 'comeplayers_group_chat_streaming_v24_ready' AS status;
