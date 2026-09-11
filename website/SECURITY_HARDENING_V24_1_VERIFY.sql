-- ComePlayers V24.1 verification.
-- Run after supabase/migrations/20260705150000_comeplayers_security_hardening_v24_1.sql.

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.marketplace_events', 'INSERT') THEN
    RAISE EXCEPTION 'anon still has INSERT on marketplace_events';
  END IF;

  IF has_table_privilege('authenticated', 'public.marketplace_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated still has INSERT on marketplace_events';
  END IF;
END;
$$;

SELECT
  'comeplayers_security_hardening_v24_1_verified' AS status,
  NOT has_table_privilege('anon', 'public.marketplace_events', 'INSERT') AS anon_event_insert_blocked,
  NOT has_table_privilege('authenticated', 'public.marketplace_events', 'INSERT') AS authenticated_event_insert_blocked;
