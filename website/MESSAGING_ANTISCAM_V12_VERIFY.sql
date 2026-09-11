-- ComePlayers V12 verification. Read-only checks.

SELECT 'tables' AS check_name, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'chat_rooms',
    'chat_messages',
    'chat_attachments',
    'chat_moderation_events',
    'chat_reports'
  )
ORDER BY table_name;

SELECT 'chat_room_columns' AS check_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'chat_rooms'
ORDER BY ordinal_position;

SELECT 'chat_message_columns' AS check_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'chat_messages'
ORDER BY ordinal_position;

SELECT 'private_bucket' AS check_name, id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'chat-attachments-private';

SELECT 'rls' AS check_name, relname AS table_name, relrowsecurity AS enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'chat_rooms',
    'chat_messages',
    'chat_attachments',
    'chat_moderation_events',
    'chat_reports'
  )
ORDER BY relname;

SELECT 'policies' AS check_name, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('chat_rooms', 'chat_messages')
ORDER BY tablename, policyname;

SELECT
  'counts' AS check_name,
  (SELECT count(*) FROM public.chat_rooms) AS rooms,
  (SELECT count(*) FROM public.chat_messages) AS messages,
  (SELECT count(*) FROM public.chat_attachments) AS attachments,
  (SELECT count(*) FROM public.chat_moderation_events WHERE status = 'open') AS open_safety_events,
  (SELECT count(*) FROM public.chat_reports WHERE status = 'open') AS open_reports;

SELECT
  'function' AS check_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'cp_get_or_create_chat_room_v12';
