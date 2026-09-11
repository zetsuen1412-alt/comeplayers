-- OPTIONAL rollback only.
-- Run this file only if you already applied the earlier V24.1 package that
-- created atomic group/stream RPC functions. The revised API routes do not
-- use these functions.

BEGIN;

DROP FUNCTION IF EXISTS public.cp_create_group_chat_v24_1(uuid, text, text, uuid[]);
DROP FUNCTION IF EXISTS public.cp_start_group_stream_v24_1(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.cp_stop_group_stream_v24_1(uuid, uuid);

COMMIT;

SELECT 'unused_atomic_group_stream_rpcs_removed' AS status;
