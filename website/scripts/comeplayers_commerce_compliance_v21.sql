-- ComePlayers V21: commerce hardening and compliance
-- Additive, idempotent migration. Review tax rules with qualified advisers before production use.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_billing_profiles (
  user_id uuid PRIMARY KEY,
  legal_name text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  country_code text NOT NULL DEFAULT 'ID',
  tax_country_code text NOT NULL DEFAULT 'ID',
  tax_identification_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_account_settings
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS national_identity_number text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS instant_messenger_type text,
  ADD COLUMN IF NOT EXISTS instant_messenger_value text;

ALTER TABLE public.user_billing_profiles
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'ID',
  ADD COLUMN IF NOT EXISTS tax_country_code text DEFAULT 'ID',
  ADD COLUMN IF NOT EXISTS tax_identification_number text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id bigserial PRIMARY KEY,
  country_code text NOT NULL,
  region_code text,
  product_type text NOT NULL DEFAULT 'digital_goods',
  rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  inclusive boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_rates_unique_window_idx
  ON public.tax_rates(country_code, COALESCE(region_code, ''), product_type, valid_from);
CREATE INDEX IF NOT EXISTS tax_rates_lookup_idx
  ON public.tax_rates(country_code, product_type, status, valid_from DESC);

CREATE TABLE IF NOT EXISTS public.order_tax_snapshots (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL UNIQUE,
  buyer_id uuid,
  country_code text NOT NULL,
  region_code text,
  product_type text NOT NULL DEFAULT 'digital_goods',
  rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  inclusive boolean NOT NULL DEFAULT false,
  taxable_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  rule_id bigint,
  rule_source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  order_id bigint NOT NULL UNIQUE,
  buyer_id uuid,
  seller_id uuid,
  currency_code text NOT NULL DEFAULT 'IDR',
  subtotal_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  payment_fee_amount numeric NOT NULL DEFAULT 0,
  taxable_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  tax_country_code text,
  tax_rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  buyer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  seller_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS taxable_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_country_code text,
  ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE TABLE IF NOT EXISTS public.prohibited_product_rules (
  id bigserial PRIMARY KEY,
  rule_key text NOT NULL UNIQUE,
  match_type text NOT NULL DEFAULT 'regex',
  pattern text NOT NULL,
  decision text NOT NULL,
  severity text NOT NULL,
  reason text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_policy_reviews (
  id bigserial PRIMARY KEY,
  product_id bigint NOT NULL,
  seller_id uuid,
  decision text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  matched_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  listing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_policy_reviews_open_idx
  ON public.product_policy_reviews(product_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS product_policy_reviews_queue_idx
  ON public.product_policy_reviews(status, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.seller_policy_strikes (
  id bigserial PRIMARY KEY,
  seller_id uuid NOT NULL,
  product_id bigint,
  review_id bigint,
  severity text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS policy_status text NOT NULL DEFAULT 'allowed',
  ADD COLUMN IF NOT EXISTS policy_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS policy_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS policy_review_id bigint;

CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  export_expires_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS privacy_requests_user_idx
  ON public.privacy_requests(user_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS privacy_requests_pending_delete_idx
  ON public.privacy_requests(user_id)
  WHERE request_type = 'delete' AND status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS public.privacy_events (
  id bigserial PRIMARY KEY,
  request_id uuid,
  user_id uuid,
  event_type text NOT NULL,
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

CREATE TABLE IF NOT EXISTS public.provider_settlement_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paypal',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  currency_code text NOT NULL DEFAULT 'USD',
  local_gross numeric NOT NULL DEFAULT 0,
  provider_gross numeric NOT NULL DEFAULT 0,
  provider_fees numeric NOT NULL DEFAULT 0,
  provider_net numeric NOT NULL DEFAULT 0,
  gross_delta numeric NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  generated_by uuid,
  source text NOT NULL DEFAULT 'admin',
  error_message text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_settlement_lines (
  id bigserial PRIMARY KEY,
  report_id uuid NOT NULL,
  capture_id text NOT NULL,
  marketplace_order_id bigint,
  paypal_transaction_id bigint,
  status text NOT NULL,
  local_gross numeric NOT NULL DEFAULT 0,
  provider_gross numeric NOT NULL DEFAULT 0,
  provider_fee numeric NOT NULL DEFAULT 0,
  provider_net numeric NOT NULL DEFAULT 0,
  gross_delta numeric NOT NULL DEFAULT 0,
  mismatches jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_settlement_reports_period_idx
  ON public.provider_settlement_reports(period_end DESC, status);
CREATE INDEX IF NOT EXISTS provider_settlement_lines_report_idx
  ON public.provider_settlement_lines(report_id, status);

CREATE TABLE IF NOT EXISTS public.risk_feedback_events (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  subject_user_id uuid NOT NULL,
  subject_role text,
  outcome text NOT NULL,
  score_delta integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS risk_feedback_events_unique_idx
  ON public.risk_feedback_events(source_type, source_id, subject_user_id, reason);
CREATE INDEX IF NOT EXISTS risk_feedback_events_subject_idx
  ON public.risk_feedback_events(subject_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_daily_metrics (
  metric_date date PRIMARY KEY,
  created_orders integer NOT NULL DEFAULT 0,
  paid_orders integer NOT NULL DEFAULT 0,
  completed_orders integer NOT NULL DEFAULT 0,
  gross_volume numeric NOT NULL DEFAULT 0,
  tax_collected numeric NOT NULL DEFAULT 0,
  marketplace_fees numeric NOT NULL DEFAULT 0,
  disputes_opened integer NOT NULL DEFAULT 0,
  support_tickets_opened integer NOT NULL DEFAULT 0,
  policy_blocks integer NOT NULL DEFAULT 0,
  late_delivery_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.cp_apply_order_tax_v21(
  p_order_id bigint,
  p_buyer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_billing public.user_billing_profiles%ROWTYPE;
  v_rate public.tax_rates%ROWTYPE;
  v_country text := 'ID';
  v_taxable numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_invoice text;
  v_buyer jsonb := '{}'::jsonb;
  v_seller jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'Buyer mismatch for this order.'; END IF;
  IF lower(COALESCE(v_order.payment_status, 'unpaid')) = 'paid' THEN
    RAISE EXCEPTION 'Tax cannot be recalculated after payment.';
  END IF;

  SELECT * INTO v_billing
  FROM public.user_billing_profiles
  WHERE user_id = p_buyer_id;

  v_country := upper(COALESCE(NULLIF(v_billing.tax_country_code, ''), NULLIF(v_billing.country_code, ''), 'ID'));

  SELECT * INTO v_rate
  FROM public.tax_rates
  WHERE country_code = v_country
    AND product_type = 'digital_goods'
    AND status = 'active'
    AND valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY valid_from DESC
  LIMIT 1;

  v_taxable := GREATEST(0, COALESCE(v_order.subtotal_amount, 0) - COALESCE(v_order.discount_amount, 0));
  IF FOUND THEN
    IF COALESCE(v_rate.inclusive, false) AND COALESCE(v_rate.rate_percent, 0) > 0 THEN
      v_tax := round(v_taxable - (v_taxable / (1 + v_rate.rate_percent / 100)), 2);
      v_total := round(v_taxable + COALESCE(v_order.payment_fee_amount, 0), 2);
    ELSE
      v_tax := round(v_taxable * COALESCE(v_rate.rate_percent, 0) / 100, 2);
      v_total := round(v_taxable + COALESCE(v_order.payment_fee_amount, 0) + v_tax, 2);
    END IF;
  ELSE
    v_tax := 0;
    v_total := round(v_taxable + COALESCE(v_order.payment_fee_amount, 0), 2);
  END IF;

  v_invoice := 'CP-' || to_char(COALESCE(v_order.created_at, now()), 'YYYY') || '-' || lpad(v_order.id::text, 10, '0');

  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'username', p.username,
    'full_name', p.full_name
  ) INTO v_buyer
  FROM public.profiles p WHERE p.id = v_order.buyer_id;
  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'username', p.username,
    'seller_name', p.seller_name
  ) INTO v_seller
  FROM public.profiles p WHERE p.id = v_order.seller_id;

  UPDATE public.orders
  SET taxable_amount = v_taxable,
      tax_amount = v_tax,
      tax_rate_percent = COALESCE(v_rate.rate_percent, 0),
      tax_country_code = v_country,
      total_price = v_total,
      total_amount = v_total,
      price = v_total::text,
      invoice_number = v_invoice,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_tax_snapshots (
    order_id, buyer_id, country_code, region_code, product_type, rate_percent,
    inclusive, taxable_amount, tax_amount, rule_id, rule_source, metadata,
    calculated_at, updated_at
  ) VALUES (
    p_order_id, p_buyer_id, v_country, v_rate.region_code, 'digital_goods',
    COALESCE(v_rate.rate_percent, 0), COALESCE(v_rate.inclusive, false),
    v_taxable, v_tax, v_rate.id, COALESCE(v_rate.source_reference, 'no_active_rate'),
    jsonb_build_object('configured', v_rate.id IS NOT NULL), now(), now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    country_code = EXCLUDED.country_code,
    region_code = EXCLUDED.region_code,
    rate_percent = EXCLUDED.rate_percent,
    inclusive = EXCLUDED.inclusive,
    taxable_amount = EXCLUDED.taxable_amount,
    tax_amount = EXCLUDED.tax_amount,
    rule_id = EXCLUDED.rule_id,
    rule_source = EXCLUDED.rule_source,
    metadata = EXCLUDED.metadata,
    calculated_at = now(),
    updated_at = now();

  INSERT INTO public.order_invoices (
    invoice_number, order_id, buyer_id, seller_id, currency_code,
    subtotal_amount, discount_amount, payment_fee_amount, taxable_amount,
    tax_amount, total_amount, tax_country_code, tax_rate_percent,
    buyer_snapshot, seller_snapshot, status, issued_at, updated_at
  ) VALUES (
    v_invoice, p_order_id, v_order.buyer_id, v_order.seller_id,
    COALESCE(v_order.currency_code, 'IDR'), COALESCE(v_order.subtotal_amount, 0),
    COALESCE(v_order.discount_amount, 0), COALESCE(v_order.payment_fee_amount, 0),
    v_taxable, v_tax, v_total, v_country, COALESCE(v_rate.rate_percent, 0),
    COALESCE(v_buyer, '{}'::jsonb) || jsonb_build_object(
      'billing', jsonb_build_object(
        'legal_name', v_billing.legal_name,
        'address_line_1', v_billing.address_line_1,
        'address_line_2', v_billing.address_line_2,
        'city', v_billing.city,
        'state', v_billing.state,
        'postal_code', v_billing.postal_code,
        'country_code', v_billing.country_code,
        'tax_country_code', v_billing.tax_country_code,
        'tax_identification_number', v_billing.tax_identification_number
      )
    ),
    COALESCE(v_seller, '{}'::jsonb), 'issued', now(), now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    subtotal_amount = EXCLUDED.subtotal_amount,
    discount_amount = EXCLUDED.discount_amount,
    payment_fee_amount = EXCLUDED.payment_fee_amount,
    taxable_amount = EXCLUDED.taxable_amount,
    tax_amount = EXCLUDED.tax_amount,
    total_amount = EXCLUDED.total_amount,
    tax_country_code = EXCLUDED.tax_country_code,
    tax_rate_percent = EXCLUDED.tax_rate_percent,
    buyer_snapshot = EXCLUDED.buyer_snapshot,
    seller_snapshot = EXCLUDED.seller_snapshot,
    updated_at = now();

  RETURN jsonb_build_object(
    'id', p_order_id,
    'invoice_number', v_invoice,
    'country_code', v_country,
    'taxable_amount', v_taxable,
    'tax_rate_percent', COALESCE(v_rate.rate_percent, 0),
    'tax_amount', v_tax,
    'total', v_total,
    'configured_rate', v_rate.id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cp_apply_order_tax_v21(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_apply_order_tax_v21(bigint, uuid) TO service_role;

INSERT INTO public.prohibited_product_rules
  (rule_key, match_type, pattern, decision, severity, reason, metadata)
VALUES
  ('stolen_or_hacked_property', 'regex', 'stolen|hacked account|cracked account|compromised account|stolen account', 'block', 'critical', 'Stolen, hacked, cracked, or compromised digital property is prohibited.', '{"introduced_in":"v21"}'),
  ('malware_or_phishing', 'regex', 'malware|ransomware|keylogger|stealer|phishing kit|credential harvester', 'block', 'critical', 'Malware, phishing tools, and credential theft products are prohibited.', '{"introduced_in":"v21"}'),
  ('payment_fraud', 'regex', 'carding|cvv|fullz|stolen card|cashout service|money mule', 'block', 'critical', 'Payment fraud, stolen financial data, and cash-out services are prohibited.', '{"introduced_in":"v21"}'),
  ('game_cheats', 'regex', 'aimbot|wallhack|esp cheat|undetected cheat|memory hack|dupe exploit', 'block', 'high', 'Cheats, exploits, and unauthorized game manipulation tools are prohibited.', '{"introduced_in":"v21"}'),
  ('region_or_identity_bypass', 'regex', 'kyc bypass|region bypass|ban bypass|identity bypass', 'block', 'high', 'Identity, region, or enforcement bypass services are prohibited.', '{"introduced_in":"v21"}'),
  ('automated_bots', 'regex', 'botting service|farming bot|macro bot|autofarm bot', 'review', 'high', 'Automation or botting services require compliance review.', '{"introduced_in":"v21"}'),
  ('boosting_service', 'regex', 'rank boost|boosting service|elo boost|piloted boosting', 'review', 'medium', 'Boosting services require manual policy and game-rule review.', '{"introduced_in":"v21"}')
ON CONFLICT (rule_key) DO UPDATE SET
  pattern = EXCLUDED.pattern,
  decision = EXCLUDED.decision,
  severity = EXCLUDED.severity,
  reason = EXCLUDED.reason,
  updated_at = now();

INSERT INTO public.launch_signoffs(area, label, status, note, metadata)
VALUES
  ('tax_configuration', 'Tax rules reviewed and activated for launch regions', 'pending', NULL, '{"introduced_in":"v21"}'),
  ('product_policy', 'Prohibited-product rules and moderation queue verified', 'pending', NULL, '{"introduced_in":"v21"}'),
  ('privacy_operations', 'Privacy export, deletion, and retention runbook verified', 'pending', NULL, '{"introduced_in":"v21"}'),
  ('provider_settlement', 'Provider settlement report matches local records', 'pending', NULL, '{"introduced_in":"v21"}')
ON CONFLICT (area) DO NOTHING;

ALTER TABLE public.user_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tax_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prohibited_product_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_policy_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_policy_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_settlement_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_billing_profiles_select_own ON public.user_billing_profiles;
CREATE POLICY user_billing_profiles_select_own ON public.user_billing_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_billing_profiles_insert_own ON public.user_billing_profiles;
CREATE POLICY user_billing_profiles_insert_own ON public.user_billing_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_billing_profiles_update_own ON public.user_billing_profiles;
CREATE POLICY user_billing_profiles_update_own ON public.user_billing_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS tax_rates_read_active ON public.tax_rates;
CREATE POLICY tax_rates_read_active ON public.tax_rates
  FOR SELECT TO authenticated USING (status = 'active');

DROP POLICY IF EXISTS privacy_requests_select_own ON public.privacy_requests;
CREATE POLICY privacy_requests_select_own ON public.privacy_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMIT;

SELECT 'comeplayers_commerce_compliance_v21_ready' AS status;
