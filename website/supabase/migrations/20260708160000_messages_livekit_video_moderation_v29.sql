-- ComePlayers V29: LiveKit video, screen sharing, and voice moderation permissions.
-- This migration only extends the managed community role permission arrays.
-- It does not replace legacy chat groups or the existing livestream flow.

BEGIN;

UPDATE public.chat_community_roles
SET
  permissions = ARRAY(
    SELECT DISTINCT permission
    FROM unnest(
      COALESCE(permissions, ARRAY[]::text[])
      || CASE lower(name)
        WHEN 'admin' THEN ARRAY[
          'connect_voice',
          'publish_video',
          'share_screen',
          'moderate_voice'
        ]::text[]
        WHEN 'moderator' THEN ARRAY[
          'connect_voice',
          'publish_video',
          'share_screen',
          'moderate_voice'
        ]::text[]
        WHEN 'member' THEN ARRAY[
          'connect_voice',
          'publish_video',
          'share_screen'
        ]::text[]
        ELSE ARRAY[]::text[]
      END
    ) AS permission
    ORDER BY permission
  ),
  updated_at = now()
WHERE lower(name) IN ('admin', 'moderator', 'member');

COMMIT;
