-- Server-only aggregate for the inbox's public community badges. Returning one
-- JSON value avoids PostgREST's row limit and transfers no message history.
CREATE OR REPLACE FUNCTION public.cp_public_channel_unread_counts(
  p_user_id uuid,
  p_channel_ids uuid[]
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channel_id', counts.channel_id,
    'unread_count', counts.unread_count
  )), '[]'::jsonb)
  FROM (
    SELECT c.id AS channel_id, count(m.id) AS unread_count
    FROM public.chat_channels c
    JOIN public.chat_communities community ON community.id = c.community_id
    JOIN public.chat_room_members member
      ON member.room_id = community.room_id
      AND member.user_id = p_user_id AND member.status = 'active'
    LEFT JOIN public.chat_channel_read_states state
      ON state.channel_id = c.id AND state.user_id = p_user_id
    LEFT JOIN public.chat_messages m
      ON m.channel_id = c.id AND m.sender_id <> p_user_id
      AND m.deleted_at IS NULL
      AND m.created_at > COALESCE(state.last_read_at, '-infinity'::timestamptz)
    WHERE c.id = ANY(p_channel_ids) AND c.is_private = false
    GROUP BY c.id
  ) counts;
$function$;

REVOKE ALL ON FUNCTION public.cp_public_channel_unread_counts(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_public_channel_unread_counts(uuid, uuid[]) TO service_role;
