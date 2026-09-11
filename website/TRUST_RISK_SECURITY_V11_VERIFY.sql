SELECT 'security_controls' AS item, count(*) AS total FROM public.user_security_controls
UNION ALL
SELECT 'security_devices', count(*) FROM public.user_security_devices
UNION ALL
SELECT 'risk_profiles', count(*) FROM public.user_risk_profiles
UNION ALL
SELECT 'security_events', count(*) FROM public.security_events;

SELECT
  id,
  user_id,
  amount,
  status,
  risk_score,
  risk_level,
  security_review_status,
  pin_verified_at,
  device_id,
  created_at
FROM public.withdrawal_requests
ORDER BY id DESC
LIMIT 20;

SELECT
  user_id,
  risk_score,
  risk_level,
  status,
  kyc_level,
  payout_daily_limit,
  reasons,
  last_evaluated_at
FROM public.user_risk_profiles
ORDER BY risk_score DESC, updated_at DESC
LIMIT 50;
