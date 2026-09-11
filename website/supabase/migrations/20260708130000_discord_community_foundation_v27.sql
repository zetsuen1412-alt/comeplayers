-- ComePlayers V27: Discord-style community foundation.
-- Keeps the existing chat_rooms group and livestream flow intact while adding
-- categories, channels, roles, permission overrides, invite links, per-channel
-- read state, bans, and audit logs. Existing group messages are assigned to
-- each community's default #general channel.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.chat_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL UNIQUE REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  icon_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_communities_name_v27_check CHECK (char_length(name) BETWEEN 3 AND 80),
  CONSTRAINT chat_communities_description_v27_check CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT chat_communities_status_v27_check CHECK (status IN ('active','archived','suspended'))
);

CREATE INDEX IF NOT EXISTS chat_communities_owner_v27_idx
  ON public.chat_communities(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_communities_status_v27_idx
  ON public.chat_communities(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_channel_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.chat_communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_channel_categories_name_v27_check CHECK (char_length(name) BETWEEN 1 AND 60),
  CONSTRAINT chat_channel_categories_position_v27_check CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_channel_categories_name_v27_uidx
  ON public.chat_channel_categories(community_id, lower(name));
CREATE INDEX IF NOT EXISTS chat_channel_categories_order_v27_idx
  ON public.chat_channel_categories(community_id, position, created_at);

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.chat_communities(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.chat_channel_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  channel_type text NOT NULL DEFAULT 'text',
  topic text,
  position integer NOT NULL DEFAULT 0,
  is_private boolean NOT NULL DEFAULT false,
  is_read_only boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_channels_name_v27_check CHECK (char_length(name) BETWEEN 1 AND 60),
  CONSTRAINT chat_channels_topic_v27_check CHECK (topic IS NULL OR char_length(topic) <= 500),
  CONSTRAINT chat_channels_type_v27_check CHECK (channel_type IN ('text','announcement','voice')),
  CONSTRAINT chat_channels_position_v27_check CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_name_v27_uidx
  ON public.chat_channels(community_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_default_v27_uidx
  ON public.chat_channels(community_id)
  WHERE is_default;
CREATE INDEX IF NOT EXISTS chat_channels_order_v27_idx
  ON public.chat_channels(community_id, category_id, position, created_at);

CREATE TABLE IF NOT EXISTS public.chat_community_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.chat_communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_managed boolean NOT NULL DEFAULT false,
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_community_roles_name_v27_check CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT chat_community_roles_position_v27_check CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_community_roles_name_v27_uidx
  ON public.chat_community_roles(community_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS chat_community_roles_default_v27_uidx
  ON public.chat_community_roles(community_id)
  WHERE is_default;
CREATE INDEX IF NOT EXISTS chat_community_roles_order_v27_idx
  ON public.chat_community_roles(community_id, position DESC, created_at);

CREATE TABLE IF NOT EXISTS public.chat_community_member_roles (
  community_id uuid NOT NULL REFERENCES public.chat_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.chat_community_roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS chat_community_member_roles_user_v27_idx
  ON public.chat_community_member_roles(user_id, community_id);
CREATE INDEX IF NOT EXISTS chat_community_member_roles_role_v27_idx
  ON public.chat_community_member_roles(role_id, user_id);

CREATE TABLE IF NOT EXISTS public.chat_channel_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.chat_community_roles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  allow_permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  deny_permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_channel_permission_target_v27_check CHECK (
    (role_id IS NOT NULL AND user_id IS NULL)
    OR (role_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_channel_permission_role_v27_uidx
  ON public.chat_channel_permission_overrides(channel_id, role_id)
  WHERE role_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_channel_permission_user_v27_uidx
  ON public.chat_channel_permission_overrides(channel_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_channel_read_states (
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  notification_level text NOT NULL DEFAULT 'all',
  muted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id),
  CONSTRAINT chat_channel_read_notification_v27_check CHECK (
    notification_level IN ('all','mentions','nothing')
  )
);

CREATE INDEX IF NOT EXISTS chat_channel_read_states_user_v27_idx
  ON public.chat_channel_read_states(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_community_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.chat_communities(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_community_invites_max_uses_v27_check CHECK (max_uses IS NULL OR max_uses BETWEEN 1 AND 10000),
  CONSTRAINT chat_community_invites_uses_v27_check CHECK (uses >= 0)
);

CREATE INDEX IF NOT EXISTS chat_community_invites_community_v27_idx
  ON public.chat_community_invites(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_community_invites_active_v27_idx
  ON public.chat_community_invites(code, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.chat_community_bans (
  community_id uuid NOT NULL REFERENCES public.chat_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  banned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  banned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (community_id, user_id),
  CONSTRAINT chat_community_bans_reason_v27_check CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX IF NOT EXISTS chat_community_bans_expiry_v27_idx
  ON public.chat_community_bans(community_id, expires_at);

CREATE TABLE IF NOT EXISTS public.chat_community_audit_logs (
  id bigserial PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.chat_communities(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_community_audit_logs_feed_v27_idx
  ON public.chat_community_audit_logs(community_id, created_at DESC);

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.chat_channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_channel_created_v27_idx
  ON public.chat_messages(channel_id, created_at)
  WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_messages_room_channel_created_v27_idx
  ON public.chat_messages(room_id, channel_id, created_at);

-- Backfill a community record for every existing legacy group room.
INSERT INTO public.chat_communities (
  room_id,
  owner_id,
  name,
  description,
  status,
  created_at,
  updated_at
)
SELECT
  room.id,
  COALESCE(room.created_by, room.buyer_id, room.seller_id),
  COALESCE(NULLIF(trim(room.title), ''), 'ComePlayers Community'),
  NULLIF(trim(room.description), ''),
  CASE WHEN room.status = 'locked' THEN 'suspended' ELSE 'active' END,
  COALESCE(room.created_at, now()),
  COALESCE(room.updated_at, room.created_at, now())
FROM public.chat_rooms room
WHERE lower(COALESCE(room.room_type, '')) = 'group'
ON CONFLICT (room_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = GREATEST(public.chat_communities.updated_at, EXCLUDED.updated_at);

-- Default Discord-like categories.
INSERT INTO public.chat_channel_categories (community_id, name, position, created_by)
SELECT community.id, defaults.name, defaults.position, community.owner_id
FROM public.chat_communities community
CROSS JOIN (
  VALUES
    ('INFORMATION', 10),
    ('TEXT CHANNELS', 20),
    ('VOICE CHANNELS', 30)
) AS defaults(name, position)
ON CONFLICT DO NOTHING;

-- Default channels. Existing messages go into #general.
INSERT INTO public.chat_channels (
  community_id,
  category_id,
  name,
  channel_type,
  topic,
  position,
  is_read_only,
  is_default,
  created_by
)
SELECT
  community.id,
  category.id,
  defaults.name,
  defaults.channel_type,
  defaults.topic,
  defaults.position,
  defaults.is_read_only,
  defaults.is_default,
  community.owner_id
FROM public.chat_communities community
JOIN public.chat_channel_categories category
  ON category.community_id = community.id
JOIN (
  VALUES
    ('INFORMATION', 'announcements', 'announcement', 'Official community updates.', 10, true, false),
    ('TEXT CHANNELS', 'general', 'text', 'General discussion for community members.', 10, false, true),
    ('TEXT CHANNELS', 'marketplace', 'text', 'Discuss games, products, and marketplace topics.', 20, false, false),
    ('VOICE CHANNELS', 'Lounge', 'voice', 'Voice channel prepared for LiveKit.', 10, false, false)
) AS defaults(category_name, name, channel_type, topic, position, is_read_only, is_default)
  ON lower(category.name) = lower(defaults.category_name)
ON CONFLICT DO NOTHING;

-- Default roles and permissions.
INSERT INTO public.chat_community_roles (
  community_id,
  name,
  color,
  position,
  is_default,
  is_managed,
  permissions
)
SELECT
  community.id,
  defaults.name,
  defaults.color,
  defaults.position,
  defaults.is_default,
  true,
  defaults.permissions
FROM public.chat_communities community
CROSS JOIN (
  VALUES
    ('Owner', '#facc15', 100, false, ARRAY['*']::text[]),
    ('Admin', '#ef4444', 80, false, ARRAY['view_channels','view_private_channels','send_messages','manage_channels','manage_roles','manage_members','manage_messages','create_invite','start_stream']::text[]),
    ('Moderator', '#22d3ee', 60, false, ARRAY['view_channels','send_messages','manage_members','manage_messages','create_invite','start_stream']::text[]),
    ('Member', '#94a3b8', 10, true, ARRAY['view_channels','send_messages','connect_voice']::text[])
) AS defaults(name, color, position, is_default, permissions)
ON CONFLICT DO NOTHING;

-- Map legacy room membership into community roles without changing the
-- original chat_room_members table used by the existing group/livestream API.
INSERT INTO public.chat_community_member_roles (
  community_id,
  user_id,
  role_id,
  assigned_by,
  assigned_at
)
SELECT
  community.id,
  member.user_id,
  role.id,
  COALESCE(member.invited_by, community.owner_id),
  COALESCE(member.joined_at, now())
FROM public.chat_communities community
JOIN public.chat_room_members member
  ON member.room_id = community.room_id
 AND lower(COALESCE(member.status, '')) = 'active'
JOIN public.chat_community_roles role
  ON role.community_id = community.id
 AND lower(role.name) = CASE lower(COALESCE(member.member_role, 'member'))
   WHEN 'owner' THEN 'owner'
   WHEN 'moderator' THEN 'moderator'
   ELSE 'member'
 END
ON CONFLICT DO NOTHING;

-- Put all legacy group messages in #general while leaving DM/trade rows null.
UPDATE public.chat_messages message
SET channel_id = channel.id
FROM public.chat_communities community
JOIN public.chat_channels channel
  ON channel.community_id = community.id
 AND channel.is_default = true
WHERE message.room_id = community.room_id
  AND message.channel_id IS NULL;

-- Seed per-channel read state from the legacy group read timestamp.
INSERT INTO public.chat_channel_read_states (
  channel_id,
  user_id,
  last_read_message_id,
  last_read_at,
  updated_at
)
SELECT
  channel.id,
  member.user_id,
  NULL,
  COALESCE(member.last_read_at, member.joined_at, now()),
  now()
FROM public.chat_communities community
JOIN public.chat_channels channel
  ON channel.community_id = community.id
 AND channel.is_default = true
JOIN public.chat_room_members member
  ON member.room_id = community.room_id
 AND lower(COALESCE(member.status, '')) = 'active'
ON CONFLICT (channel_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cp_is_active_community_member_v27(
  p_community_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      public.cp_is_admin(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.chat_communities community
        JOIN public.chat_room_members member
          ON member.room_id = community.room_id
        LEFT JOIN public.chat_community_bans ban
          ON ban.community_id = community.id
         AND ban.user_id = member.user_id
         AND (ban.expires_at IS NULL OR ban.expires_at > now())
        WHERE community.id = p_community_id
          AND member.user_id = p_user_id
          AND lower(COALESCE(member.status, '')) = 'active'
          AND ban.user_id IS NULL
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.cp_has_community_permission_v27(
  p_community_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.cp_is_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.chat_communities community
      WHERE community.id = p_community_id
        AND community.owner_id = p_user_id
    )
    OR (
      public.cp_is_active_community_member_v27(p_community_id, p_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.chat_community_member_roles assignment
        JOIN public.chat_community_roles role
          ON role.id = assignment.role_id
         AND role.community_id = assignment.community_id
        WHERE assignment.community_id = p_community_id
          AND assignment.user_id = p_user_id
          AND ('*' = ANY(role.permissions) OR p_permission = ANY(role.permissions))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.cp_can_view_chat_channel_v27(
  p_channel_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id uuid;
  v_private boolean;
  v_denied boolean;
  v_allowed boolean;
BEGIN
  SELECT channel.community_id, channel.is_private
  INTO v_community_id, v_private
  FROM public.chat_channels channel
  WHERE channel.id = p_channel_id;

  IF v_community_id IS NULL
     OR NOT public.cp_is_active_community_member_v27(v_community_id, p_user_id) THEN
    RETURN false;
  END IF;

  IF NOT v_private
     OR public.cp_has_community_permission_v27(v_community_id, p_user_id, 'view_private_channels') THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.chat_channel_permission_overrides override_row
    LEFT JOIN public.chat_community_member_roles assignment
      ON assignment.role_id = override_row.role_id
     AND assignment.community_id = v_community_id
     AND assignment.user_id = p_user_id
    WHERE override_row.channel_id = p_channel_id
      AND (override_row.user_id = p_user_id OR assignment.user_id = p_user_id)
      AND 'view_channel' = ANY(override_row.deny_permissions)
  ) INTO v_denied;

  IF v_denied THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.chat_channel_permission_overrides override_row
    LEFT JOIN public.chat_community_member_roles assignment
      ON assignment.role_id = override_row.role_id
     AND assignment.community_id = v_community_id
     AND assignment.user_id = p_user_id
    WHERE override_row.channel_id = p_channel_id
      AND (override_row.user_id = p_user_id OR assignment.user_id = p_user_id)
      AND 'view_channel' = ANY(override_row.allow_permissions)
  ) INTO v_allowed;

  RETURN v_allowed;
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_can_send_chat_channel_v27(
  p_channel_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id uuid;
  v_read_only boolean;
  v_type text;
  v_denied boolean;
  v_allowed boolean;
BEGIN
  SELECT channel.community_id, channel.is_read_only, channel.channel_type
  INTO v_community_id, v_read_only, v_type
  FROM public.chat_channels channel
  WHERE channel.id = p_channel_id;

  IF v_community_id IS NULL
     OR v_type = 'voice'
     OR NOT public.cp_can_view_chat_channel_v27(p_channel_id, p_user_id) THEN
    RETURN false;
  END IF;

  IF v_read_only
     AND NOT public.cp_has_community_permission_v27(v_community_id, p_user_id, 'manage_messages') THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.chat_channel_permission_overrides override_row
    LEFT JOIN public.chat_community_member_roles assignment
      ON assignment.role_id = override_row.role_id
     AND assignment.community_id = v_community_id
     AND assignment.user_id = p_user_id
    WHERE override_row.channel_id = p_channel_id
      AND (override_row.user_id = p_user_id OR assignment.user_id = p_user_id)
      AND 'send_messages' = ANY(override_row.deny_permissions)
  ) INTO v_denied;

  IF v_denied THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.chat_channel_permission_overrides override_row
    LEFT JOIN public.chat_community_member_roles assignment
      ON assignment.role_id = override_row.role_id
     AND assignment.community_id = v_community_id
     AND assignment.user_id = p_user_id
    WHERE override_row.channel_id = p_channel_id
      AND (override_row.user_id = p_user_id OR assignment.user_id = p_user_id)
      AND 'send_messages' = ANY(override_row.allow_permissions)
  ) INTO v_allowed;

  IF v_allowed THEN
    RETURN true;
  END IF;

  RETURN public.cp_has_community_permission_v27(v_community_id, p_user_id, 'send_messages');
END;
$$;

REVOKE ALL ON FUNCTION public.cp_is_active_community_member_v27(uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cp_has_community_permission_v27(uuid, uuid, text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cp_can_view_chat_channel_v27(uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cp_can_send_chat_channel_v27(uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cp_is_active_community_member_v27(uuid, uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cp_has_community_permission_v27(uuid, uuid, text)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cp_can_view_chat_channel_v27(uuid, uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cp_can_send_chat_channel_v27(uuid, uuid)
TO authenticated, service_role;

ALTER TABLE public.chat_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_community_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_community_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_read_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_community_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_community_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_community_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_chat_communities_member_read_v27 ON public.chat_communities;
CREATE POLICY cp_chat_communities_member_read_v27 ON public.chat_communities
FOR SELECT TO authenticated
USING (public.cp_is_active_community_member_v27(id, (select auth.uid())));

DROP POLICY IF EXISTS cp_chat_channel_categories_member_read_v27 ON public.chat_channel_categories;
CREATE POLICY cp_chat_channel_categories_member_read_v27 ON public.chat_channel_categories
FOR SELECT TO authenticated
USING (public.cp_is_active_community_member_v27(community_id, (select auth.uid())));

DROP POLICY IF EXISTS cp_chat_channels_member_read_v27 ON public.chat_channels;
CREATE POLICY cp_chat_channels_member_read_v27 ON public.chat_channels
FOR SELECT TO authenticated
USING (public.cp_can_view_chat_channel_v27(id, (select auth.uid())));

DROP POLICY IF EXISTS cp_chat_community_roles_member_read_v27 ON public.chat_community_roles;
CREATE POLICY cp_chat_community_roles_member_read_v27 ON public.chat_community_roles
FOR SELECT TO authenticated
USING (public.cp_is_active_community_member_v27(community_id, (select auth.uid())));

DROP POLICY IF EXISTS cp_chat_community_member_roles_self_read_v27 ON public.chat_community_member_roles;
CREATE POLICY cp_chat_community_member_roles_self_read_v27 ON public.chat_community_member_roles
FOR SELECT TO authenticated
USING (
  user_id = (select auth.uid())
  OR public.cp_has_community_permission_v27(community_id, (select auth.uid()), 'manage_roles')
);

DROP POLICY IF EXISTS cp_chat_channel_permission_member_read_v27 ON public.chat_channel_permission_overrides;
CREATE POLICY cp_chat_channel_permission_member_read_v27 ON public.chat_channel_permission_overrides
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_channels channel
    WHERE channel.id = chat_channel_permission_overrides.channel_id
      AND public.cp_has_community_permission_v27(channel.community_id, (select auth.uid()), 'manage_channels')
  )
);

DROP POLICY IF EXISTS cp_chat_channel_read_states_self_select_v27 ON public.chat_channel_read_states;
CREATE POLICY cp_chat_channel_read_states_self_select_v27 ON public.chat_channel_read_states
FOR SELECT TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS cp_chat_channel_read_states_self_insert_v27 ON public.chat_channel_read_states;
CREATE POLICY cp_chat_channel_read_states_self_insert_v27 ON public.chat_channel_read_states
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (select auth.uid())
  AND public.cp_can_view_chat_channel_v27(channel_id, (select auth.uid()))
);

DROP POLICY IF EXISTS cp_chat_channel_read_states_self_update_v27 ON public.chat_channel_read_states;
CREATE POLICY cp_chat_channel_read_states_self_update_v27 ON public.chat_channel_read_states
FOR UPDATE TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (
  user_id = (select auth.uid())
  AND public.cp_can_view_chat_channel_v27(channel_id, (select auth.uid()))
);

DROP POLICY IF EXISTS cp_chat_community_invites_manager_read_v27 ON public.chat_community_invites;
CREATE POLICY cp_chat_community_invites_manager_read_v27 ON public.chat_community_invites
FOR SELECT TO authenticated
USING (public.cp_has_community_permission_v27(community_id, (select auth.uid()), 'create_invite'));

DROP POLICY IF EXISTS cp_chat_community_bans_manager_read_v27 ON public.chat_community_bans;
CREATE POLICY cp_chat_community_bans_manager_read_v27 ON public.chat_community_bans
FOR SELECT TO authenticated
USING (public.cp_has_community_permission_v27(community_id, (select auth.uid()), 'manage_members'));

DROP POLICY IF EXISTS cp_chat_community_audit_manager_read_v27 ON public.chat_community_audit_logs;
CREATE POLICY cp_chat_community_audit_manager_read_v27 ON public.chat_community_audit_logs
FOR SELECT TO authenticated
USING (public.cp_has_community_permission_v27(community_id, (select auth.uid()), 'manage_members'));

-- Restrict structural mutations to protected server routes. Read-state rows may
-- also be updated by the current authenticated user through the policies above.
REVOKE INSERT, UPDATE, DELETE ON public.chat_communities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_channel_categories FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_channels FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_community_roles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_community_member_roles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_channel_permission_overrides FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_community_invites FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_community_bans FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_community_audit_logs FROM anon, authenticated;

GRANT SELECT ON public.chat_communities TO authenticated;
GRANT SELECT ON public.chat_channel_categories TO authenticated;
GRANT SELECT ON public.chat_channels TO authenticated;
GRANT SELECT ON public.chat_community_roles TO authenticated;
GRANT SELECT ON public.chat_community_member_roles TO authenticated;
GRANT SELECT ON public.chat_channel_permission_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_channel_read_states TO authenticated;
GRANT SELECT ON public.chat_community_invites TO authenticated;
GRANT SELECT ON public.chat_community_bans TO authenticated;
GRANT SELECT ON public.chat_community_audit_logs TO authenticated;

GRANT ALL ON public.chat_communities TO service_role;
GRANT ALL ON public.chat_channel_categories TO service_role;
GRANT ALL ON public.chat_channels TO service_role;
GRANT ALL ON public.chat_community_roles TO service_role;
GRANT ALL ON public.chat_community_member_roles TO service_role;
GRANT ALL ON public.chat_channel_permission_overrides TO service_role;
GRANT ALL ON public.chat_channel_read_states TO service_role;
GRANT ALL ON public.chat_community_invites TO service_role;
GRANT ALL ON public.chat_community_bans TO service_role;
GRANT ALL ON public.chat_community_audit_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.chat_community_audit_logs_id_seq TO service_role;

-- Tighten message reads so private channel messages are not exposed through
-- Supabase Realtime to members who cannot view that channel.
DROP POLICY IF EXISTS cp_chat_messages_participant_read ON public.chat_messages;
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
            AND lower(COALESCE(member.status, '')) = 'active'
        )
      )
      AND (
        chat_messages.channel_id IS NULL
        OR public.cp_can_view_chat_channel_v27(chat_messages.channel_id, (select auth.uid()))
      )
  )
);

COMMIT;

SELECT
  'comeplayers_discord_community_foundation_v27_ready' AS status,
  (SELECT count(*) FROM public.chat_communities) AS communities,
  (SELECT count(*) FROM public.chat_channels) AS channels,
  (SELECT count(*) FROM public.chat_community_roles) AS roles;
