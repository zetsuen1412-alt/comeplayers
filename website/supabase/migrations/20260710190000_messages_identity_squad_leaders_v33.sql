-- ComePlayers V33: member-created communities, squad discovery, and leader roles.
-- Every authenticated user can create a group/party and use the social features.
-- Group owners and appointed leaders retain member-management authority.

BEGIN;

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS party_game text,
  ADD COLUMN IF NOT EXISTS party_mode text,
  ADD COLUMN IF NOT EXISTS party_rank text,
  ADD COLUMN IF NOT EXISTS party_platform text,
  ADD COLUMN IF NOT EXISTS party_region text,
  ADD COLUMN IF NOT EXISTS party_size integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS party_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS party_updated_at timestamptz;

UPDATE public.chat_rooms
SET
  party_size = GREATEST(2, LEAST(20, COALESCE(party_size, 5))),
  party_open = COALESCE(party_open, false),
  party_updated_at = COALESCE(party_updated_at, updated_at, created_at, now())
WHERE party_size IS NULL
   OR party_size < 2
   OR party_size > 20
   OR party_open IS NULL
   OR party_updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_rooms_party_size_v33_check'
      AND conrelid = 'public.chat_rooms'::regclass
  ) THEN
    ALTER TABLE public.chat_rooms
      ADD CONSTRAINT chat_rooms_party_size_v33_check
      CHECK (party_size BETWEEN 2 AND 20);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS chat_rooms_open_party_v33_idx
  ON public.chat_rooms(party_game, party_region, party_updated_at DESC)
  WHERE room_type = 'group' AND party_open = true AND status = 'active';

-- Members may use every participation feature, including starting a group live.
-- Structural/member management remains controlled by Owner/Moderator roles.
UPDATE public.chat_community_roles
SET
  permissions = ARRAY(
    SELECT DISTINCT permission
    FROM unnest(COALESCE(permissions, ARRAY[]::text[]) || ARRAY['start_stream']::text[]) AS permission
  ),
  updated_at = now()
WHERE lower(name) = 'member'
  AND NOT ('start_stream' = ANY(permissions));

CREATE OR REPLACE FUNCTION public.cp_join_open_party_v33(
  p_room_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room_row public.chat_rooms%ROWTYPE;
  member_count integer;
  existing_status text;
  now_value timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Party and user are required.' USING ERRCODE = '22023';
  END IF;

  -- Serialize joins for one party so concurrent requests cannot exceed capacity.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_room_id::text, 33));

  SELECT *
  INTO room_row
  FROM public.chat_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR lower(COALESCE(room_row.room_type, '')) <> 'group' THEN
    RAISE EXCEPTION 'Party was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF lower(COALESCE(room_row.status, 'active')) <> 'active' THEN
    RAISE EXCEPTION 'This party is no longer active.' USING ERRCODE = 'P0001';
  END IF;

  SELECT status
  INTO existing_status
  FROM public.chat_room_members
  WHERE room_id = p_room_id AND user_id = p_user_id;

  IF lower(COALESCE(existing_status, '')) = 'active' THEN
    RETURN jsonb_build_object(
      'room_id', p_room_id,
      'joined', false,
      'already_member', true
    );
  END IF;

  IF room_row.party_open IS NOT TRUE THEN
    RAISE EXCEPTION 'This party is closed.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer
  INTO member_count
  FROM public.chat_room_members
  WHERE room_id = p_room_id AND lower(COALESCE(status, '')) = 'active';

  IF member_count >= COALESCE(room_row.party_size, 5) THEN
    UPDATE public.chat_rooms
    SET party_open = false, party_updated_at = now_value, updated_at = now_value
    WHERE id = p_room_id;
    RAISE EXCEPTION 'This party is already full.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.chat_room_members (
    room_id,
    user_id,
    member_role,
    status,
    invited_by,
    last_read_at,
    joined_at,
    updated_at
  ) VALUES (
    p_room_id,
    p_user_id,
    'member',
    'active',
    room_row.created_by,
    COALESCE(room_row.last_message_at, now_value),
    now_value,
    now_value
  )
  ON CONFLICT (room_id, user_id) DO UPDATE
  SET
    member_role = 'member',
    status = 'active',
    invited_by = EXCLUDED.invited_by,
    last_read_at = EXCLUDED.last_read_at,
    joined_at = now_value,
    updated_at = now_value;

  member_count := member_count + 1;

  UPDATE public.chat_rooms
  SET
    party_open = CASE
      WHEN member_count >= COALESCE(party_size, 5) THEN false
      ELSE party_open
    END,
    party_updated_at = now_value,
    updated_at = now_value,
    last_message = CASE
      WHEN last_message IS NULL OR last_message IN ('Group created', 'Party created')
        THEN 'A player joined the party'
      ELSE last_message
    END
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'room_id', p_room_id,
    'joined', true,
    'already_member', false,
    'member_count', member_count,
    'party_size', COALESCE(room_row.party_size, 5)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cp_join_open_party_v33(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_join_open_party_v33(uuid, uuid) TO service_role;

COMMIT;

SELECT 'messages_identity_squad_leaders_v33_ready' AS status;
