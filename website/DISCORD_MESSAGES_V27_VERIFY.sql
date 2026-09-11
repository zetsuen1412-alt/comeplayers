-- ComePlayers Messages V27 verification.
-- Run after 20260708130000_discord_community_foundation_v27.sql.

DO $$
DECLARE
  missing_tables text[];
  missing_default_channels integer;
  unmapped_group_messages integer;
BEGIN
  SELECT array_agg(required.name)
  INTO missing_tables
  FROM (
    VALUES
      ('chat_communities'),
      ('chat_channel_categories'),
      ('chat_channels'),
      ('chat_community_roles'),
      ('chat_community_member_roles'),
      ('chat_channel_permission_overrides'),
      ('chat_channel_read_states'),
      ('chat_community_invites'),
      ('chat_community_bans'),
      ('chat_community_audit_logs')
  ) AS required(name)
  WHERE to_regclass('public.' || required.name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Messages V27 missing tables: %', array_to_string(missing_tables, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'channel_id'
  ) THEN
    RAISE EXCEPTION 'Messages V27 missing chat_messages.channel_id';
  END IF;

  SELECT count(*)
  INTO missing_default_channels
  FROM public.chat_communities community
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.chat_channels channel
    WHERE channel.community_id = community.id
      AND channel.is_default = true
  );

  IF missing_default_channels > 0 THEN
    RAISE EXCEPTION '% communities have no default channel', missing_default_channels;
  END IF;

  SELECT count(*)
  INTO unmapped_group_messages
  FROM public.chat_messages message
  JOIN public.chat_rooms room ON room.id = message.room_id
  WHERE lower(COALESCE(room.room_type, '')) = 'group'
    AND message.channel_id IS NULL;

  IF unmapped_group_messages > 0 THEN
    RAISE EXCEPTION '% legacy group messages were not mapped to #general', unmapped_group_messages;
  END IF;
END;
$$;

SELECT
  'comeplayers_messages_v27_verified' AS status,
  (SELECT count(*) FROM public.chat_communities) AS communities,
  (SELECT count(*) FROM public.chat_channel_categories) AS categories,
  (SELECT count(*) FROM public.chat_channels) AS channels,
  (SELECT count(*) FROM public.chat_community_roles) AS roles,
  (SELECT count(*) FROM public.chat_community_invites WHERE revoked_at IS NULL) AS active_invites;
