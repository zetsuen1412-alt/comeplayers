BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_account_settings (
  user_id uuid PRIMARY KEY,
  phone_number text,
  mfa_enabled boolean DEFAULT false,
  show_followers boolean DEFAULT true,
  accept_profile_chat boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_account_settings
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_followers boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_profile_chat boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.user_verifications (
  user_id uuid PRIMARY KEY,
  phone_verified boolean DEFAULT false,
  email_verified boolean DEFAULT false,
  identity_verified boolean DEFAULT false,
  phone_number text,
  kyc_level integer DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_verifications
  ADD COLUMN IF NOT EXISTS phone_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS kyc_level integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.user_verifications
SET kyc_level = GREATEST(
  COALESCE(kyc_level, 0),
  CASE
    WHEN COALESCE(identity_verified, false) THEN 2
    WHEN COALESCE(phone_verified, false) THEN 1
    ELSE 0
  END
);

CREATE TABLE IF NOT EXISTS public.user_security_controls (
  user_id uuid PRIMARY KEY,
  withdrawal_pin_hash text,
  withdrawal_pin_salt text,
  pin_version integer DEFAULT 1,
  pin_set_at timestamptz,
  pin_failed_attempts integer DEFAULT 0,
  pin_locked_until timestamptz,
  payout_cooldown_until timestamptz,
  cooldown_reason text,
  mfa_required_for_payout boolean DEFAULT false,
  security_version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_security_controls
  ADD COLUMN IF NOT EXISTS withdrawal_pin_hash text,
  ADD COLUMN IF NOT EXISTS withdrawal_pin_salt text,
  ADD COLUMN IF NOT EXISTS pin_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pin_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_failed_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS payout_cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS cooldown_reason text,
  ADD COLUMN IF NOT EXISTS mfa_required_for_payout boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS security_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.user_security_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_key_hash text NOT NULL,
  device_name text DEFAULT 'Current device',
  user_agent text,
  ip_hash text,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  trusted_at timestamptz,
  revoked_at timestamptz,
  last_used_for_payout_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_security_devices
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS device_key_hash text,
  ADD COLUMN IF NOT EXISTS device_name text DEFAULT 'Current device',
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS ip_hash text,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trusted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_for_payout_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS user_security_devices_user_key_idx
  ON public.user_security_devices(user_id, device_key_hash);
CREATE INDEX IF NOT EXISTS user_security_devices_user_seen_idx
  ON public.user_security_devices(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.user_risk_profiles (
  user_id uuid PRIMARY KEY,
  risk_score integer DEFAULT 0,
  risk_level text DEFAULT 'low',
  status text DEFAULT 'active',
  kyc_level integer DEFAULT 0,
  payout_daily_limit numeric DEFAULT 500000,
  reasons jsonb DEFAULT '[]'::jsonb,
  last_evaluated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_risk_profiles
  ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS kyc_level integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_daily_limit numeric DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS reasons jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.security_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  severity text DEFAULT 'info',
  status text DEFAULT 'open',
  source text DEFAULT 'web',
  device_id uuid,
  ip_hash text,
  details jsonb DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_events
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS device_id uuid,
  ADD COLUMN IF NOT EXISTS ip_hash text,
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS security_events_user_created_idx
  ON public.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_queue_idx
  ON public.security_events(status, severity, created_at DESC);

ALTER TABLE public.payout_accounts
  ADD COLUMN IF NOT EXISTS security_changed_at timestamptz;

UPDATE public.payout_accounts
SET security_changed_at = COALESCE(security_changed_at, updated_at, created_at, now());

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS risk_reasons jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS device_id uuid,
  ADD COLUMN IF NOT EXISTS security_review_status text DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS pin_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.cp_create_withdrawal_request_v11(
  p_user_id uuid,
  p_payout_account_id bigint,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_request_key uuid DEFAULT gen_random_uuid(),
  p_hold_hours integer DEFAULT 24,
  p_risk_score integer DEFAULT 0,
  p_risk_level text DEFAULT 'low',
  p_risk_reasons jsonb DEFAULT '[]'::jsonb,
  p_device_id uuid DEFAULT NULL,
  p_security_review_status text DEFAULT 'automatic',
  p_pin_verified_at timestamptz DEFAULT now(),
  p_min_kyc_level integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_controls public.user_security_controls%ROWTYPE;
  v_profile public.user_risk_profiles%ROWTYPE;
  v_verification public.user_verifications%ROWTYPE;
  v_result jsonb;
  v_withdrawal_id bigint;
  v_kyc_level integer := 0;
BEGIN
  INSERT INTO public.user_security_controls (user_id, created_at, updated_at)
  VALUES (p_user_id, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_controls
  FROM public.user_security_controls
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF COALESCE(v_controls.withdrawal_pin_hash, '') = '' THEN
    RAISE EXCEPTION 'Set a withdrawal PIN before requesting payout.';
  END IF;

  IF v_controls.pin_locked_until IS NOT NULL AND v_controls.pin_locked_until > now() THEN
    RAISE EXCEPTION 'Withdrawal PIN is temporarily locked.';
  END IF;

  IF v_controls.payout_cooldown_until IS NOT NULL AND v_controls.payout_cooldown_until > now() THEN
    RAISE EXCEPTION 'Payout security cooldown is active until %.', v_controls.payout_cooldown_until;
  END IF;

  SELECT * INTO v_profile
  FROM public.user_risk_profiles
  WHERE user_id = p_user_id;

  IF FOUND AND lower(COALESCE(v_profile.status, 'active')) = 'blocked' THEN
    RAISE EXCEPTION 'Withdrawals are blocked pending a security review.';
  END IF;

  SELECT * INTO v_verification
  FROM public.user_verifications
  WHERE user_id = p_user_id;

  IF FOUND THEN
    v_kyc_level := GREATEST(
      COALESCE(v_verification.kyc_level, 0),
      CASE
        WHEN COALESCE(v_verification.identity_verified, false) THEN 2
        WHEN COALESCE(v_verification.phone_verified, false) THEN 1
        ELSE 0
      END
    );
  END IF;

  IF v_kyc_level < GREATEST(COALESCE(p_min_kyc_level, 0), 0) THEN
    RAISE EXCEPTION 'KYC level % is required for withdrawals.', p_min_kyc_level;
  END IF;

  v_result := public.cp_create_withdrawal_request_v10(
    p_user_id,
    p_payout_account_id,
    p_amount,
    p_note,
    p_request_key,
    LEAST(GREATEST(COALESCE(p_hold_hours, 24), 0), 168)
  );

  v_withdrawal_id := NULLIF(v_result->>'withdrawal_id', '')::bigint;

  IF v_withdrawal_id IS NOT NULL THEN
    UPDATE public.withdrawal_requests
    SET
      risk_score = LEAST(GREATEST(COALESCE(p_risk_score, 0), 0), 100),
      risk_level = lower(COALESCE(NULLIF(p_risk_level, ''), 'low')),
      risk_reasons = COALESCE(p_risk_reasons, '[]'::jsonb),
      device_id = p_device_id,
      security_review_status = lower(COALESCE(NULLIF(p_security_review_status, ''), 'automatic')),
      pin_verified_at = COALESCE(p_pin_verified_at, now()),
      updated_at = now()
    WHERE id = v_withdrawal_id AND user_id = p_user_id;

    IF p_device_id IS NOT NULL THEN
      UPDATE public.user_security_devices
      SET last_used_for_payout_at = now(), updated_at = now()
      WHERE id = p_device_id AND user_id = p_user_id;
    END IF;

    INSERT INTO public.user_risk_profiles (
      user_id, risk_score, risk_level, status, kyc_level,
      payout_daily_limit, reasons, last_evaluated_at, created_at, updated_at
    ) VALUES (
      p_user_id,
      LEAST(GREATEST(COALESCE(p_risk_score, 0), 0), 100),
      lower(COALESCE(NULLIF(p_risk_level, ''), 'low')),
      'active',
      v_kyc_level,
      CASE
        WHEN v_kyc_level >= 3 THEN 500000000
        WHEN v_kyc_level >= 2 THEN 100000000
        WHEN v_kyc_level >= 1 THEN 5000000
        ELSE 500000
      END,
      COALESCE(p_risk_reasons, '[]'::jsonb),
      now(), now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      risk_score = EXCLUDED.risk_score,
      risk_level = EXCLUDED.risk_level,
      kyc_level = GREATEST(public.user_risk_profiles.kyc_level, EXCLUDED.kyc_level),
      payout_daily_limit = GREATEST(public.user_risk_profiles.payout_daily_limit, EXCLUDED.payout_daily_limit),
      reasons = EXCLUDED.reasons,
      last_evaluated_at = now(),
      updated_at = now();
  END IF;

  RETURN v_result || jsonb_build_object(
    'risk_score', LEAST(GREATEST(COALESCE(p_risk_score, 0), 0), 100),
    'risk_level', lower(COALESCE(NULLIF(p_risk_level, ''), 'low')),
    'security_review_status', lower(COALESCE(NULLIF(p_security_review_status, ''), 'automatic')),
    'kyc_level', v_kyc_level
  );
END;
$$;

ALTER TABLE public.user_security_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_security_controls_select_own ON public.user_security_controls;
CREATE POLICY user_security_controls_select_own
ON public.user_security_controls FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_security_devices_select_own ON public.user_security_devices;
CREATE POLICY user_security_devices_select_own
ON public.user_security_devices FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_risk_profiles_select_own ON public.user_risk_profiles;
CREATE POLICY user_risk_profiles_select_own
ON public.user_risk_profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS security_events_select_own ON public.security_events;
CREATE POLICY security_events_select_own
ON public.security_events FOR SELECT
TO authenticated
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.user_security_controls FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_security_devices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_risk_profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.security_events FROM anon, authenticated;

GRANT SELECT ON public.user_security_controls TO authenticated;
GRANT SELECT ON public.user_security_devices TO authenticated;
GRANT SELECT ON public.user_risk_profiles TO authenticated;
GRANT SELECT ON public.security_events TO authenticated;

REVOKE ALL ON FUNCTION public.cp_create_withdrawal_request_v11(
  uuid, bigint, numeric, text, uuid, integer, integer, text, jsonb,
  uuid, text, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_create_withdrawal_request_v11(
  uuid, bigint, numeric, text, uuid, integer, integer, text, jsonb,
  uuid, text, timestamptz, integer
) TO service_role;

COMMIT;

SELECT
  'comeplayers_trust_risk_security_v11_ready' AS status,
  (SELECT count(*) FROM public.user_security_controls) AS security_controls_count,
  (SELECT count(*) FROM public.user_security_devices) AS security_devices_count,
  (SELECT count(*) FROM public.security_events) AS security_events_count;
