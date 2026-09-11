-- ComePlayers V23.5 - profile schema compatibility for auth and tax flows.
-- Run after V23.4. Adds the nullable profile display-name column expected by
-- seller applications, messaging, risk pages, and seller tax snapshots.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text;

COMMENT ON COLUMN public.profiles.full_name
  IS 'Optional display/legal name used by profile, seller application, and finance snapshot flows.';

COMMIT;

SELECT 'comeplayers_profiles_full_name_v23_5_ready' AS status;
