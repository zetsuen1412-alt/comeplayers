-- Run in Supabase SQL Editor after applying V29.
SELECT
  community_id,
  name,
  position,
  permissions
FROM public.chat_community_roles
WHERE lower(name) IN ('owner', 'admin', 'moderator', 'member')
ORDER BY community_id, position DESC;
