-- ComePlayers V24.1: marketplace analytics security hardening.
-- Group creation and livestream behavior remain on the original V24 API flow.

BEGIN;

-- Browser roles must not write analytics rows directly. All analytics writes
-- pass through validated server routes using the service-role client.
ALTER TABLE IF EXISTS public.marketplace_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert marketplace analytics events"
  ON public.marketplace_events;
DROP POLICY IF EXISTS cp_marketplace_events_browser_insert
  ON public.marketplace_events;

REVOKE INSERT, UPDATE, DELETE ON public.marketplace_events
  FROM anon, authenticated;
GRANT SELECT ON public.marketplace_events TO authenticated;
GRANT ALL ON public.marketplace_events TO service_role;

COMMIT;

SELECT 'comeplayers_security_hardening_v24_1_ready' AS status;
