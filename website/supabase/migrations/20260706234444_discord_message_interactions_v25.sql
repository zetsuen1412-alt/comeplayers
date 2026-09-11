-- ComePlayers V25: Discord-style message interactions across web, desktop, and mobile.
-- Adds true replies, emoji reactions, safe edit/delete support, and a private
-- Realtime Broadcast/Presence topic used for typing indicators.

BEGIN;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_reply_to_v25_idx
  ON public.chat_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT chat_message_reactions_emoji_v25_check
    CHECK (emoji IN ('👍','❤️','😂','🔥','🎮','✅'))
);

CREATE INDEX IF NOT EXISTS chat_message_reactions_room_v25_idx
  ON public.chat_message_reactions(room_id, message_id, created_at);
CREATE INDEX IF NOT EXISTS chat_message_reactions_user_v25_idx
  ON public.chat_message_reactions(user_id, created_at DESC);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_chat_message_reactions_participant_read_v25
  ON public.chat_message_reactions;
CREATE POLICY cp_chat_message_reactions_participant_read_v25
ON public.chat_message_reactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_rooms room
    WHERE room.id = chat_message_reactions.room_id
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

REVOKE INSERT, UPDATE, DELETE ON public.chat_message_reactions FROM anon, authenticated;
GRANT SELECT ON public.chat_message_reactions TO authenticated;
GRANT ALL ON public.chat_message_reactions TO service_role;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS cp_chat_interactions_realtime_read_v25 ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS cp_chat_interactions_realtime_write_v25 ON realtime.messages';

    EXECUTE $policy$
      CREATE POLICY cp_chat_interactions_realtime_read_v25 ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1
          FROM public.chat_rooms room
          WHERE room.id = (
            CASE
              WHEN (select realtime.topic()) ~ '^chat-room:[0-9a-fA-F-]{36}$'
                THEN split_part((select realtime.topic()), ':', 2)::uuid
              ELSE NULL::uuid
            END
          )
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
      )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY cp_chat_interactions_realtime_write_v25 ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND EXISTS (
          SELECT 1
          FROM public.chat_rooms room
          WHERE room.id = (
            CASE
              WHEN (select realtime.topic()) ~ '^chat-room:[0-9a-fA-F-]{36}$'
                THEN split_part((select realtime.topic()), ':', 2)::uuid
              ELSE NULL::uuid
            END
          )
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
      )
    $policy$;
  END IF;
END;
$$;

COMMIT;

SELECT 'comeplayers_discord_message_interactions_v25_ready' AS status;
