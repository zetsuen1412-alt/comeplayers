-- ComePlayers V34: consent-based group invitations and random squad matchmaking.
-- Players are never added by an invitation until they explicitly accept it.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.chat_party_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'direct',
  status text NOT NULL DEFAULT 'pending',
  message text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_party_invitations_distinct_users_v34_check CHECK (inviter_id <> invitee_id),
  CONSTRAINT chat_party_invitations_source_v34_check CHECK (source IN ('direct', 'group_create', 'matchmaking')),
  CONSTRAINT chat_party_invitations_status_v34_check CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_party_invitations_pending_unique_v34_idx
  ON public.chat_party_invitations(room_id, invitee_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS chat_party_invitations_received_v34_idx
  ON public.chat_party_invitations(invitee_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_party_invitations_sent_v34_idx
  ON public.chat_party_invitations(inviter_id, status, created_at DESC);

ALTER TABLE public.chat_party_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_chat_party_invitations_read_v34 ON public.chat_party_invitations;
CREATE POLICY cp_chat_party_invitations_read_v34
ON public.chat_party_invitations
FOR SELECT
TO authenticated
USING (
  invitee_id = (select auth.uid())
  OR inviter_id = (select auth.uid())
  OR public.cp_is_admin((select auth.uid()))
);

REVOKE INSERT, UPDATE, DELETE ON public.chat_party_invitations FROM anon, authenticated;
GRANT SELECT ON public.chat_party_invitations TO authenticated;
GRANT ALL ON public.chat_party_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.cp_respond_party_invite_v34(
  p_invite_id uuid,
  p_user_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row public.chat_party_invitations%ROWTYPE;
  room_row public.chat_rooms%ROWTYPE;
  active_members integer;
  capacity integer;
  now_value timestamptz := now();
  normalized_action text := lower(trim(COALESCE(p_action, '')));
BEGIN
  IF p_invite_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invitation and user are required.' USING ERRCODE = '22023';
  END IF;

  IF normalized_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'Action must be accept or decline.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO invite_row
  FROM public.chat_party_invitations
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND OR invite_row.invitee_id <> p_user_id THEN
    RAISE EXCEPTION 'Invitation was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF invite_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation has already been answered.' USING ERRCODE = 'P0001';
  END IF;

  IF invite_row.expires_at <= now_value THEN
    RAISE EXCEPTION 'Invitation has expired.' USING ERRCODE = 'P0001';
  END IF;

  IF normalized_action = 'decline' THEN
    UPDATE public.chat_party_invitations
    SET status = 'declined', responded_at = now_value, updated_at = now_value
    WHERE id = p_invite_id;

    RETURN jsonb_build_object('invite_id', p_invite_id, 'room_id', invite_row.room_id, 'status', 'declined', 'joined', false);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(invite_row.room_id::text, 34));

  SELECT * INTO room_row
  FROM public.chat_rooms
  WHERE id = invite_row.room_id
  FOR UPDATE;

  IF NOT FOUND OR lower(COALESCE(room_row.room_type, '')) <> 'group' THEN
    RAISE EXCEPTION 'Group was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF lower(COALESCE(room_row.status, 'active')) <> 'active' THEN
    RAISE EXCEPTION 'This group is no longer active.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chat_room_members member
    WHERE member.room_id = invite_row.room_id
      AND member.user_id = p_user_id
      AND lower(COALESCE(member.status, '')) = 'active'
  ) THEN
    UPDATE public.chat_party_invitations
    SET status = 'accepted', responded_at = now_value, updated_at = now_value
    WHERE id = p_invite_id;
    RETURN jsonb_build_object('invite_id', p_invite_id, 'room_id', invite_row.room_id, 'status', 'accepted', 'joined', false, 'already_member', true);
  END IF;

  SELECT count(*)::integer INTO active_members
  FROM public.chat_room_members member
  WHERE member.room_id = invite_row.room_id
    AND lower(COALESCE(member.status, '')) = 'active';

  capacity := CASE
    WHEN room_row.party_game IS NOT NULL THEN GREATEST(2, LEAST(20, COALESCE(room_row.party_size, 5)))
    ELSE 50
  END;

  IF active_members >= capacity THEN
    IF room_row.party_game IS NOT NULL THEN
      UPDATE public.chat_rooms
      SET party_open = false, party_updated_at = now_value, updated_at = now_value
      WHERE id = invite_row.room_id;
    END IF;
    RAISE EXCEPTION 'This squad is already full.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.chat_room_members (
    room_id, user_id, member_role, status, invited_by, last_read_at, joined_at, updated_at
  ) VALUES (
    invite_row.room_id, p_user_id, 'member', 'active', invite_row.inviter_id,
    COALESCE(room_row.last_message_at, now_value), now_value, now_value
  )
  ON CONFLICT (room_id, user_id) DO UPDATE
  SET member_role = 'member', status = 'active', invited_by = EXCLUDED.invited_by,
      last_read_at = EXCLUDED.last_read_at, joined_at = now_value, updated_at = now_value;

  active_members := active_members + 1;

  UPDATE public.chat_party_invitations
  SET status = 'accepted', responded_at = now_value, updated_at = now_value
  WHERE id = p_invite_id;

  UPDATE public.chat_party_invitations
  SET status = 'cancelled', responded_at = now_value, updated_at = now_value
  WHERE room_id = invite_row.room_id AND invitee_id = p_user_id
    AND id <> p_invite_id AND status = 'pending';

  UPDATE public.chat_rooms
  SET party_open = CASE WHEN party_game IS NOT NULL AND active_members >= capacity THEN false ELSE party_open END,
      party_updated_at = CASE WHEN party_game IS NOT NULL THEN now_value ELSE party_updated_at END,
      updated_at = now_value,
      last_message = CASE WHEN last_message IS NULL OR last_message IN ('Group created', 'Party created')
        THEN 'A player accepted the invitation' ELSE last_message END
  WHERE id = invite_row.room_id;

  RETURN jsonb_build_object('invite_id', p_invite_id, 'room_id', invite_row.room_id,
    'status', 'accepted', 'joined', true, 'member_count', active_members, 'capacity', capacity);
END;
$$;

REVOKE ALL ON FUNCTION public.cp_respond_party_invite_v34(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_respond_party_invite_v34(uuid, uuid, text) TO service_role;

COMMIT;

SELECT 'messages_invite_accept_matchmaking_v34_ready' AS status;
