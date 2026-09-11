-- ComePlayers V23 — immutable pricing snapshots, finance governance,
-- seller tax statements, verified tax residency, FX snapshots, accounting close,
-- and PayPal provider payout execution. Apply after V22.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.seller_tax_settings') IS NULL
     OR to_regclass('public.seller_sales_tax_snapshots') IS NULL
     OR to_regclass('public.withdrawal_tax_rates') IS NULL
     OR to_regclass('public.seller_tax_ledger') IS NULL
     OR to_regclass('public.launch_signoffs') IS NULL THEN
    RAISE EXCEPTION 'ComePlayers V23 requires all migrations through V22.';
  END IF;
END;
$$;

-- V22 fixed the rate at exactly 5%. V23 makes every change versioned and
-- dual-approved instead of requiring a source-code migration.
ALTER TABLE public.seller_tax_settings
  DROP CONSTRAINT IF EXISTS seller_tax_settings_fixed_rate;
ALTER TABLE public.seller_tax_settings
  DROP CONSTRAINT IF EXISTS seller_tax_settings_rate_range;
ALTER TABLE public.seller_tax_settings
  ADD CONSTRAINT seller_tax_settings_rate_range
  CHECK (sales_tax_rate_percent >= 0 AND sales_tax_rate_percent <= 100);
ALTER TABLE public.seller_tax_settings
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.marketplace_fee_settings (
  id bigserial PRIMARY KEY,
  setting_key text NOT NULL DEFAULT 'global_marketplace_fee',
  rate_percent numeric(8,4) NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  source_reference text,
  approved_request_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_fee_rate_range CHECK (rate_percent >= 0 AND rate_percent <= 50),
  CONSTRAINT marketplace_fee_status_check CHECK (status IN ('active','scheduled','inactive')),
  CONSTRAINT marketplace_fee_window_check CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_fee_settings_version_idx
  ON public.marketplace_fee_settings(setting_key, valid_from);
CREATE INDEX IF NOT EXISTS marketplace_fee_settings_lookup_idx
  ON public.marketplace_fee_settings(setting_key, status, valid_from DESC);

INSERT INTO public.marketplace_fee_settings(
  setting_key, rate_percent, status, valid_from, source_reference, metadata
)
SELECT
  'global_marketplace_fee',
  COALESCE((
    SELECT round(COALESCE(o.marketplace_fee_amount,0) / NULLIF(o.seller_gross_amount,0) * 100, 4)
    FROM public.orders o
    WHERE COALESCE(o.seller_gross_amount,0) > 0
      AND COALESCE(o.marketplace_fee_amount,0) >= 0
    ORDER BY COALESCE(o.completed_at,o.paid_at,o.created_at) DESC
    LIMIT 1
  ), 5),
  'active', now(),
  'V23 baseline inferred from latest V22 settlement; review before production',
  '{"introduced_in":"v23","requires_admin_review":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.marketplace_fee_settings
  WHERE setting_key='global_marketplace_fee'
);

CREATE TABLE IF NOT EXISTS public.seller_sales_tax_rates (
  id bigserial PRIMARY KEY,
  setting_key text NOT NULL DEFAULT 'global_seller_sales_tax',
  rate_percent numeric(8,4) NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  source_reference text,
  approved_request_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_sales_tax_rates_range CHECK (rate_percent >= 0 AND rate_percent <= 100),
  CONSTRAINT seller_sales_tax_rates_status_check CHECK (status IN ('active','scheduled','inactive')),
  CONSTRAINT seller_sales_tax_rates_window_check CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS seller_sales_tax_rates_version_idx
  ON public.seller_sales_tax_rates(setting_key, valid_from);
CREATE INDEX IF NOT EXISTS seller_sales_tax_rates_lookup_idx
  ON public.seller_sales_tax_rates(setting_key, status, valid_from DESC);

INSERT INTO public.seller_sales_tax_rates(
  setting_key, rate_percent, status, valid_from, source_reference, metadata
)
SELECT setting_key, sales_tax_rate_percent,
       CASE WHEN lower(status)='active' THEN 'active' ELSE 'inactive' END,
       COALESCE(valid_from,created_at,now()), source_reference,
       COALESCE(metadata,'{}'::jsonb) || '{"migrated_to":"v23_history"}'::jsonb
FROM public.seller_tax_settings s
WHERE s.setting_key='global_seller_sales_tax'
  AND NOT EXISTS (
    SELECT 1 FROM public.seller_sales_tax_rates r
    WHERE r.setting_key='global_seller_sales_tax'
  );

CREATE TABLE IF NOT EXISTS public.rate_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type text NOT NULL,
  target_key text NOT NULL,
  proposed_rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  proposed_fixed_amount numeric NOT NULL DEFAULT 0,
  country_code text,
  payout_method text,
  currency text,
  effective_from timestamptz NOT NULL,
  source_reference text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  first_approved_by uuid,
  first_approved_at timestamptz,
  second_approved_by uuid,
  second_approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  applied_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_change_type_check CHECK (rate_type IN ('marketplace_fee','seller_sales_tax','withdrawal_tax')),
  CONSTRAINT rate_change_status_check CHECK (status IN ('pending','partially_approved','applied','rejected','cancelled')),
  CONSTRAINT rate_change_percent_check CHECK (proposed_rate_percent >= 0 AND proposed_rate_percent <= 100),
  CONSTRAINT rate_change_fixed_check CHECK (proposed_fixed_amount >= 0),
  CONSTRAINT rate_change_distinct_approvers CHECK (
    first_approved_by IS NULL OR second_approved_by IS NULL OR first_approved_by <> second_approved_by
  )
);
CREATE INDEX IF NOT EXISTS rate_change_requests_status_idx
  ON public.rate_change_requests(status,created_at DESC);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS marketplace_fee_rate_percent numeric(8,4) DEFAULT 5;
ALTER TABLE public.order_invoices
  ADD COLUMN IF NOT EXISTS seller_marketplace_fee_rate_percent numeric(8,4) DEFAULT 5;

CREATE TABLE IF NOT EXISTS public.order_pricing_snapshots (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL UNIQUE,
  seller_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  seller_gross_amount numeric NOT NULL DEFAULT 0,
  marketplace_fee_rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  marketplace_fee_amount numeric NOT NULL DEFAULT 0,
  seller_sales_tax_rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  seller_sales_tax_amount numeric NOT NULL DEFAULT 0,
  seller_net_amount numeric NOT NULL DEFAULT 0,
  marketplace_fee_setting_id bigint,
  seller_tax_rate_id bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_pricing_snapshots_seller_idx
  ON public.order_pricing_snapshots(seller_id,captured_at DESC);

INSERT INTO public.order_pricing_snapshots(
  order_id,seller_id,currency,seller_gross_amount,
  marketplace_fee_rate_percent,marketplace_fee_amount,
  seller_sales_tax_rate_percent,seller_sales_tax_amount,seller_net_amount,
  metadata,captured_at,updated_at
)
SELECT o.id,o.seller_id,COALESCE(NULLIF(o.currency_code,''),'IDR'),
       COALESCE(NULLIF(o.seller_gross_amount,0),GREATEST(COALESCE(o.subtotal_amount,0)-COALESCE(o.discount_amount,0),0)),
       CASE WHEN COALESCE(o.seller_gross_amount,0)>0
         THEN round(COALESCE(o.marketplace_fee_amount,0)/o.seller_gross_amount*100,4)
         ELSE 0 END,
       COALESCE(o.marketplace_fee_amount,0),
       COALESCE(o.seller_sales_tax_rate_percent,0),
       COALESCE(o.seller_sales_tax_amount,0),
       COALESCE(o.seller_earning_amount,0),
       jsonb_build_object('backfilled_by','v23','historical',true),
       COALESCE(o.created_at,now()),now()
FROM public.orders o
WHERE o.seller_id IS NOT NULL
ON CONFLICT(order_id) DO NOTHING;

UPDATE public.orders o
SET marketplace_fee_rate_percent=s.marketplace_fee_rate_percent
FROM public.order_pricing_snapshots s
WHERE s.order_id=o.id;
UPDATE public.order_invoices i
SET seller_marketplace_fee_rate_percent=s.marketplace_fee_rate_percent
FROM public.order_pricing_snapshots s
WHERE s.order_id=i.order_id;

CREATE TABLE IF NOT EXISTS public.seller_tax_residencies (
  seller_id uuid PRIMARY KEY,
  country_code text NOT NULL,
  legal_name text NOT NULL,
  tax_identifier_last4 text,
  tax_identifier_ciphertext text,
  tax_identifier_iv text,
  tax_identifier_auth_tag text,
  tax_identifier_key_version integer NOT NULL DEFAULT 1,
  residency_since date,
  evidence_reference text,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid,
  verified_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_tax_residency_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT seller_tax_residency_status_check CHECK (status IN ('pending','verified','rejected'))
);

CREATE TABLE IF NOT EXISTS public.platform_finance_settings (
  setting_key text PRIMARY KEY,
  value_text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_finance_settings(setting_key,value_text,metadata)
VALUES ('wallet_base_currency','IDR','{"introduced_in":"v23"}'::jsonb)
ON CONFLICT(setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id bigserial PRIMARY KEY,
  base_currency text NOT NULL,
  quote_currency text NOT NULL,
  rate numeric(24,10) NOT NULL,
  provider text NOT NULL,
  source_reference text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_rate_positive CHECK (rate>0),
  CONSTRAINT fx_currency_check CHECK (base_currency ~ '^[A-Z]{3}$' AND quote_currency ~ '^[A-Z]{3}$' AND base_currency<>quote_currency),
  CONSTRAINT fx_status_check CHECK (status IN ('active','scheduled','inactive')),
  CONSTRAINT fx_window_check CHECK (valid_to IS NULL OR valid_to>valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS fx_rates_version_idx
  ON public.fx_rates(base_currency,quote_currency,valid_from);
CREATE INDEX IF NOT EXISTS fx_rates_lookup_idx
  ON public.fx_rates(base_currency,quote_currency,status,valid_from DESC);

CREATE TABLE IF NOT EXISTS public.fx_snapshots (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_currency text NOT NULL,
  payout_currency text NOT NULL,
  source_amount numeric NOT NULL,
  rate numeric(24,10) NOT NULL,
  payout_amount numeric NOT NULL,
  fx_rate_id bigint,
  provider text,
  source_reference text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_snapshot_unique UNIQUE(source_type,source_id)
);

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS source_currency text DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS payout_currency text,
  ADD COLUMN IF NOT EXISTS source_amount numeric,
  ADD COLUMN IF NOT EXISTS fx_rate numeric(24,10) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fx_rate_id bigint,
  ADD COLUMN IF NOT EXISTS payout_gross_amount numeric,
  ADD COLUMN IF NOT EXISTS payout_tax_amount numeric,
  ADD COLUMN IF NOT EXISTS payout_provider_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_net_amount numeric,
  ADD COLUMN IF NOT EXISTS provider_batch_id text,
  ADD COLUMN IF NOT EXISTS provider_item_id text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb;

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL UNIQUE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opened_by uuid,
  closed_by uuid,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_period_status_check CHECK (status IN ('open','closing','closed')),
  CONSTRAINT accounting_period_window_check CHECK (period_end>period_start)
);

CREATE TABLE IF NOT EXISTS public.seller_tax_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_number text NOT NULL UNIQUE,
  accounting_period_id uuid,
  seller_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  currency text NOT NULL,
  sales_taxable_amount numeric NOT NULL DEFAULT 0,
  sales_tax_amount numeric NOT NULL DEFAULT 0,
  withdrawal_taxable_amount numeric NOT NULL DEFAULT 0,
  withdrawal_tax_amount numeric NOT NULL DEFAULT 0,
  total_tax_amount numeric NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  issued_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_statement_unique UNIQUE(seller_id,period_start,period_end,currency),
  CONSTRAINT seller_statement_status_check CHECK (status IN ('open','closed'))
);
CREATE INDEX IF NOT EXISTS seller_tax_statements_seller_idx
  ON public.seller_tax_statements(seller_id,period_start DESC);

CREATE TABLE IF NOT EXISTS public.seller_tax_statement_lines (
  id bigserial PRIMARY KEY,
  statement_id uuid NOT NULL,
  ledger_id bigint NOT NULL,
  tax_type text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  taxable_amount numeric NOT NULL,
  rate_percent numeric(8,4) NOT NULL,
  fixed_amount numeric NOT NULL,
  tax_amount numeric NOT NULL,
  currency text NOT NULL,
  recognized_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_statement_line_unique UNIQUE(statement_id,ledger_id)
);

CREATE TABLE IF NOT EXISTS public.payout_execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id bigint NOT NULL,
  provider text NOT NULL,
  idempotency_key text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  action text NOT NULL,
  status text NOT NULL,
  provider_batch_id text,
  provider_item_id text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  executed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_attempt_idempotency UNIQUE(provider,idempotency_key,action,attempt_number)
);
CREATE INDEX IF NOT EXISTS payout_execution_attempts_withdrawal_idx
  ON public.payout_execution_attempts(withdrawal_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.cp_apply_seller_tax_v23(
  p_order_id bigint,
  p_buyer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.order_pricing_snapshots%ROWTYPE;
  v_fee public.marketplace_fee_settings%ROWTYPE;
  v_tax public.seller_sales_tax_rates%ROWTYPE;
  v_billing public.user_billing_profiles%ROWTYPE;
  v_gross numeric;
  v_fee_amount numeric;
  v_tax_amount numeric;
  v_net numeric;
  v_total numeric;
  v_invoice text;
  v_buyer jsonb := '{}'::jsonb;
  v_seller jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'Buyer mismatch for this order.'; END IF;

  SELECT * INTO v_existing FROM public.order_pricing_snapshots WHERE order_id=p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id',p_order_id,'seller_gross_amount',v_existing.seller_gross_amount,
      'marketplace_fee_rate_percent',v_existing.marketplace_fee_rate_percent,
      'marketplace_fee_amount',v_existing.marketplace_fee_amount,
      'seller_sales_tax_rate_percent',v_existing.seller_sales_tax_rate_percent,
      'seller_sales_tax_amount',v_existing.seller_sales_tax_amount,
      'seller_net_amount',v_existing.seller_net_amount,
      'total',COALESCE(v_order.total_amount,v_order.total_price,0),
      'immutable_snapshot',true,'tax_bearer','seller'
    );
  END IF;

  IF lower(COALESCE(v_order.payment_status,'unpaid'))='paid' THEN
    RAISE EXCEPTION 'Pricing snapshot cannot be created after payment.';
  END IF;

  SELECT * INTO v_fee FROM public.marketplace_fee_settings
  WHERE setting_key='global_marketplace_fee'
    AND status IN ('active','scheduled')
    AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active marketplace fee is not configured.'; END IF;

  SELECT * INTO v_tax FROM public.seller_sales_tax_rates
  WHERE setting_key='global_seller_sales_tax'
    AND status IN ('active','scheduled')
    AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active seller sales tax is not configured.'; END IF;

  SELECT * INTO v_billing FROM public.user_billing_profiles WHERE user_id=p_buyer_id;
  SELECT jsonb_build_object('id',p.id,'email',p.email,'username',p.username,'full_name',p.full_name)
    INTO v_buyer FROM public.profiles p WHERE p.id=v_order.buyer_id;
  SELECT jsonb_build_object('id',p.id,'email',p.email,'username',p.username,'seller_name',p.seller_name)
    INTO v_seller FROM public.profiles p WHERE p.id=v_order.seller_id;

  v_gross := round(GREATEST(COALESCE(v_order.subtotal_amount,0)-COALESCE(v_order.discount_amount,0),0),2);
  v_fee_amount := round(v_gross*v_fee.rate_percent/100,2);
  v_tax_amount := round(v_gross*v_tax.rate_percent/100,2);
  v_net := round(GREATEST(v_gross-v_fee_amount-v_tax_amount,0),2);
  v_total := round(v_gross+COALESCE(v_order.payment_fee_amount,0),2);
  IF v_total<=0 THEN RAISE EXCEPTION 'Order total is invalid.'; END IF;
  v_invoice := 'CP-'||to_char(COALESCE(v_order.created_at,now()),'YYYY')||'-'||lpad(v_order.id::text,10,'0');

  INSERT INTO public.order_pricing_snapshots(
    order_id,seller_id,currency,seller_gross_amount,
    marketplace_fee_rate_percent,marketplace_fee_amount,
    seller_sales_tax_rate_percent,seller_sales_tax_amount,seller_net_amount,
    marketplace_fee_setting_id,seller_tax_rate_id,metadata
  ) VALUES (
    p_order_id,v_order.seller_id,COALESCE(NULLIF(v_order.currency_code,''),'IDR'),v_gross,
    v_fee.rate_percent,v_fee_amount,v_tax.rate_percent,v_tax_amount,v_net,
    v_fee.id,v_tax.id,jsonb_build_object('version','v23','immutable',true)
  );

  UPDATE public.orders SET
    taxable_amount=0,tax_amount=0,tax_rate_percent=0,tax_country_code=NULL,
    seller_gross_amount=v_gross,marketplace_fee_rate_percent=v_fee.rate_percent,
    marketplace_fee_amount=v_fee_amount,seller_sales_tax_rate_percent=v_tax.rate_percent,
    seller_sales_tax_amount=v_tax_amount,seller_earning_amount=v_net,
    total_price=v_total,total_amount=v_total,price=v_total::text,
    invoice_number=v_invoice,updated_at=now()
  WHERE id=p_order_id;

  INSERT INTO public.order_tax_snapshots(
    order_id,buyer_id,country_code,region_code,product_type,rate_percent,inclusive,
    taxable_amount,tax_amount,rule_id,rule_source,metadata,calculated_at,updated_at
  ) VALUES (
    p_order_id,p_buyer_id,upper(COALESCE(NULLIF(v_billing.country_code,''),'ID')),NULL,
    'digital_goods',0,false,0,0,NULL,'v23_buyer_tax_disabled',
    jsonb_build_object('tax_bearer','seller','version','v23'),now(),now()
  ) ON CONFLICT(order_id) DO UPDATE SET
    rate_percent=0,inclusive=false,taxable_amount=0,tax_amount=0,rule_id=NULL,
    rule_source=EXCLUDED.rule_source,metadata=EXCLUDED.metadata,calculated_at=now(),updated_at=now();

  INSERT INTO public.seller_sales_tax_snapshots(
    order_id,seller_id,taxable_amount,rate_percent,tax_amount,tax_bearer,
    source_reference,metadata,calculated_at,updated_at
  ) VALUES (
    p_order_id,v_order.seller_id,v_gross,v_tax.rate_percent,v_tax_amount,'seller',
    v_tax.source_reference,jsonb_build_object('version','v23','rate_id',v_tax.id),now(),now()
  ) ON CONFLICT(order_id) DO UPDATE SET
    taxable_amount=EXCLUDED.taxable_amount,rate_percent=EXCLUDED.rate_percent,
    tax_amount=EXCLUDED.tax_amount,source_reference=EXCLUDED.source_reference,
    metadata=EXCLUDED.metadata,calculated_at=now(),updated_at=now();

  INSERT INTO public.order_invoices(
    invoice_number,order_id,buyer_id,seller_id,currency_code,subtotal_amount,
    discount_amount,payment_fee_amount,taxable_amount,tax_amount,total_amount,
    tax_country_code,tax_rate_percent,seller_gross_amount,
    seller_marketplace_fee_amount,seller_marketplace_fee_rate_percent,
    seller_sales_tax_rate_percent,seller_sales_tax_amount,seller_net_amount,
    buyer_snapshot,seller_snapshot,status,issued_at,metadata,updated_at
  ) VALUES (
    v_invoice,p_order_id,v_order.buyer_id,v_order.seller_id,
    COALESCE(NULLIF(v_order.currency_code,''),'IDR'),COALESCE(v_order.subtotal_amount,0),
    COALESCE(v_order.discount_amount,0),COALESCE(v_order.payment_fee_amount,0),0,0,v_total,
    NULL,0,v_gross,v_fee_amount,v_fee.rate_percent,v_tax.rate_percent,v_tax_amount,v_net,
    COALESCE(v_buyer,'{}'::jsonb)||jsonb_build_object('billing',jsonb_build_object(
      'legal_name',v_billing.legal_name,'address_line_1',v_billing.address_line_1,
      'address_line_2',v_billing.address_line_2,'city',v_billing.city,'state',v_billing.state,
      'postal_code',v_billing.postal_code,'country_code',v_billing.country_code)),
    COALESCE(v_seller,'{}'::jsonb),'issued',now(),
    jsonb_build_object('version','v23','immutable_pricing',true,'tax_bearer','seller'),now()
  ) ON CONFLICT(order_id) DO UPDATE SET
    total_amount=EXCLUDED.total_amount,seller_gross_amount=EXCLUDED.seller_gross_amount,
    seller_marketplace_fee_amount=EXCLUDED.seller_marketplace_fee_amount,
    seller_marketplace_fee_rate_percent=EXCLUDED.seller_marketplace_fee_rate_percent,
    seller_sales_tax_rate_percent=EXCLUDED.seller_sales_tax_rate_percent,
    seller_sales_tax_amount=EXCLUDED.seller_sales_tax_amount,
    seller_net_amount=EXCLUDED.seller_net_amount,metadata=EXCLUDED.metadata,updated_at=now();

  RETURN jsonb_build_object(
    'id',p_order_id,'invoice_number',v_invoice,'buyer_tax_amount',0,
    'seller_gross_amount',v_gross,'marketplace_fee_rate_percent',v_fee.rate_percent,
    'marketplace_fee_amount',v_fee_amount,'seller_sales_tax_rate_percent',v_tax.rate_percent,
    'seller_sales_tax_amount',v_tax_amount,'seller_net_amount',v_net,'total',v_total,
    'immutable_snapshot',true,'tax_bearer','seller'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_order_and_release_escrow_v23(
  p_order_id bigint,
  p_buyer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_snapshot public.order_pricing_snapshots%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_before numeric;
  v_after numeric;
  v_transaction_id bigint;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'Only the buyer can complete this order.'; END IF;

  SELECT * INTO v_snapshot FROM public.order_pricing_snapshots WHERE order_id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Immutable V23 pricing snapshot is missing.'; END IF;

  IF lower(COALESCE(v_order.status,''))='completed' OR lower(COALESCE(v_order.escrow_status,''))='released' THEN
    RETURN jsonb_build_object(
      'already_completed',true,'seller_id',v_order.seller_id,'seller_gross',v_snapshot.seller_gross_amount,
      'seller_earning',v_snapshot.seller_net_amount,'marketplace_fee',v_snapshot.marketplace_fee_amount,
      'marketplace_fee_rate_percent',v_snapshot.marketplace_fee_rate_percent,
      'seller_sales_tax',v_snapshot.seller_sales_tax_amount,
      'seller_sales_tax_rate_percent',v_snapshot.seller_sales_tax_rate_percent,'order_id',v_order.id
    );
  END IF;
  IF lower(COALESCE(v_order.payment_status,''))<>'paid' THEN RAISE EXCEPTION 'Order must be paid before completion.'; END IF;
  IF lower(COALESCE(v_order.status,''))<>'delivered' THEN RAISE EXCEPTION 'Order must be delivered before buyer confirmation.'; END IF;
  IF v_order.seller_id IS NULL THEN RAISE EXCEPTION 'Seller ID is missing on this order.'; END IF;

  INSERT INTO public.wallets(user_id,balance,pending_balance,created_at,updated_at)
  VALUES(v_order.seller_id,0,0,now(),now()) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_order.seller_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller wallet could not be created.'; END IF;
  v_before:=COALESCE(v_wallet.balance,0);
  v_after:=v_before+v_snapshot.seller_net_amount;

  INSERT INTO public.wallet_transactions(
    wallet_id,user_id,order_id,type,transaction_type,amount,balance_before,balance_after,
    status,description,metadata
  ) VALUES (
    v_wallet.id,v_order.seller_id,p_order_id,'seller_order_payout','seller_order_payout',
    v_snapshot.seller_net_amount,v_before,v_after,'completed',
    'Seller proceeds using immutable V23 marketplace fee and seller sales-tax snapshot',
    jsonb_build_object(
      'seller_gross_amount',v_snapshot.seller_gross_amount,
      'marketplace_fee',v_snapshot.marketplace_fee_amount,
      'marketplace_fee_rate_percent',v_snapshot.marketplace_fee_rate_percent,
      'seller_sales_tax',v_snapshot.seller_sales_tax_amount,
      'seller_sales_tax_rate_percent',v_snapshot.seller_sales_tax_rate_percent,
      'pricing_snapshot_id',v_snapshot.id,'tax_bearer','seller','version','v23'
    )
  ) ON CONFLICT DO NOTHING RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    RETURN jsonb_build_object(
      'already_completed',true,'seller_id',v_order.seller_id,'seller_gross',v_snapshot.seller_gross_amount,
      'seller_earning',v_snapshot.seller_net_amount,'marketplace_fee',v_snapshot.marketplace_fee_amount,
      'marketplace_fee_rate_percent',v_snapshot.marketplace_fee_rate_percent,
      'seller_sales_tax',v_snapshot.seller_sales_tax_amount,
      'seller_sales_tax_rate_percent',v_snapshot.seller_sales_tax_rate_percent,'order_id',v_order.id
    );
  END IF;

  UPDATE public.wallets SET balance=v_after,total_earned=COALESCE(total_earned,0)+v_snapshot.seller_net_amount,updated_at=now()
  WHERE id=v_wallet.id;
  UPDATE public.orders SET
    status='completed',payment_status='paid',escrow_status='released',seller_payout_status='released',
    seller_gross_amount=v_snapshot.seller_gross_amount,
    marketplace_fee_rate_percent=v_snapshot.marketplace_fee_rate_percent,
    marketplace_fee_amount=v_snapshot.marketplace_fee_amount,
    seller_sales_tax_rate_percent=v_snapshot.seller_sales_tax_rate_percent,
    seller_sales_tax_amount=v_snapshot.seller_sales_tax_amount,
    seller_earning_amount=v_snapshot.seller_net_amount,completed_at=now(),updated_at=now()
  WHERE id=p_order_id;
  UPDATE public.order_invoices SET
    seller_gross_amount=v_snapshot.seller_gross_amount,
    seller_marketplace_fee_amount=v_snapshot.marketplace_fee_amount,
    seller_marketplace_fee_rate_percent=v_snapshot.marketplace_fee_rate_percent,
    seller_sales_tax_rate_percent=v_snapshot.seller_sales_tax_rate_percent,
    seller_sales_tax_amount=v_snapshot.seller_sales_tax_amount,
    seller_net_amount=v_snapshot.seller_net_amount,
    metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('settled_from_snapshot',v_snapshot.id,'settled_at',now()),
    updated_at=now()
  WHERE order_id=p_order_id;

  INSERT INTO public.seller_tax_ledger(
    seller_id,tax_type,source_type,source_id,taxable_amount,rate_percent,fixed_amount,
    tax_amount,currency,status,metadata,recognized_at,updated_at
  ) VALUES (
    v_order.seller_id,'sales_tax','order',p_order_id::text,v_snapshot.seller_gross_amount,
    v_snapshot.seller_sales_tax_rate_percent,0,v_snapshot.seller_sales_tax_amount,
    v_snapshot.currency,'withheld',jsonb_build_object(
      'marketplace_fee',v_snapshot.marketplace_fee_amount,
      'marketplace_fee_rate_percent',v_snapshot.marketplace_fee_rate_percent,
      'seller_net',v_snapshot.seller_net_amount,'pricing_snapshot_id',v_snapshot.id
    ),now(),now()
  ) ON CONFLICT(tax_type,source_type,source_id) DO UPDATE SET
    taxable_amount=EXCLUDED.taxable_amount,rate_percent=EXCLUDED.rate_percent,
    tax_amount=EXCLUDED.tax_amount,status=EXCLUDED.status,metadata=EXCLUDED.metadata,
    recognized_at=EXCLUDED.recognized_at,updated_at=now();

  RETURN jsonb_build_object(
    'already_completed',false,'seller_id',v_order.seller_id,'seller_gross',v_snapshot.seller_gross_amount,
    'seller_earning',v_snapshot.seller_net_amount,'marketplace_fee',v_snapshot.marketplace_fee_amount,
    'marketplace_fee_rate_percent',v_snapshot.marketplace_fee_rate_percent,
    'seller_sales_tax',v_snapshot.seller_sales_tax_amount,
    'seller_sales_tax_rate_percent',v_snapshot.seller_sales_tax_rate_percent,'order_id',v_order.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_quote_withdrawal_v23(
  p_user_id uuid,
  p_payout_account_id bigint,
  p_source_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_account public.payout_accounts%ROWTYPE;
  v_rule public.withdrawal_tax_rates%ROWTYPE;
  v_fx public.fx_rates%ROWTYPE;
  v_source_currency text:='IDR';
  v_payout_currency text;
  v_country text;
  v_method text;
  v_source_amount numeric;
  v_rate numeric:=1;
  v_gross numeric;
  v_tax numeric;
  v_net numeric;
BEGIN
  SELECT * INTO v_account FROM public.payout_accounts
  WHERE id=p_payout_account_id AND user_id=p_user_id AND lower(COALESCE(status,'active'))='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active payout account not found.'; END IF;
  SELECT upper(value_text) INTO v_source_currency FROM public.platform_finance_settings WHERE setting_key='wallet_base_currency';
  v_source_currency:=COALESCE(NULLIF(v_source_currency,''),'IDR');
  v_payout_currency:=upper(COALESCE(NULLIF(v_account.currency,''),v_source_currency));
  v_country:=upper(COALESCE(NULLIF(v_account.country_code,''),'ID'));
  v_method:=lower(COALESCE(NULLIF(v_account.method,''),'bank_transfer'));
  v_source_amount:=round(GREATEST(COALESCE(p_source_amount,0),0),2);
  IF v_source_amount<=0 THEN RAISE EXCEPTION 'Withdrawal amount must be positive.'; END IF;

  IF v_source_currency<>v_payout_currency THEN
    SELECT * INTO v_fx FROM public.fx_rates
    WHERE base_currency=v_source_currency AND quote_currency=v_payout_currency
      AND status IN ('active','scheduled') AND valid_from<=now()
      AND (valid_to IS NULL OR valid_to>now())
    ORDER BY valid_from DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'FX rate is not configured for % to %.',v_source_currency,v_payout_currency; END IF;
    v_rate:=v_fx.rate;
  END IF;
  v_gross:=round(v_source_amount*v_rate,2);

  SELECT * INTO v_rule FROM public.withdrawal_tax_rates
  WHERE country_code=v_country AND payout_method=v_method AND upper(currency)=v_payout_currency
    AND lower(status)='active' AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())
  ORDER BY valid_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal tax rate is not configured for country %, method %, and currency %.',v_country,v_method,v_payout_currency; END IF;
  v_tax:=round(LEAST(v_gross,v_gross*COALESCE(v_rule.rate_percent,0)/100+COALESCE(v_rule.fixed_amount,0)),2);
  v_net:=round(GREATEST(v_gross-v_tax,0),2);

  RETURN jsonb_build_object(
    'source_amount',v_source_amount,'source_currency',v_source_currency,
    'payout_currency',v_payout_currency,'fx_rate',v_rate,'fx_rate_id',v_fx.id,
    'fx_provider',v_fx.provider,'fx_source_reference',v_fx.source_reference,
    'payout_gross_amount',v_gross,'country_code',v_country,'payout_method',v_method,
    'rate_percent',COALESCE(v_rule.rate_percent,0),'fixed_amount',COALESCE(v_rule.fixed_amount,0),
    'tax_amount',v_tax,'payout_net_amount',v_net,'rule_id',v_rule.id,
    'tax_source_reference',v_rule.source_reference
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_create_withdrawal_request_v23(
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
SET search_path=public
AS $$
DECLARE
  v_existing public.withdrawal_requests%ROWTYPE;
  v_quote jsonb;
  v_result jsonb;
  v_id bigint;
BEGIN
  SELECT * INTO v_existing FROM public.withdrawal_requests WHERE request_key=p_request_key LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('already_created',true,'withdrawal_id',v_existing.id,'status',v_existing.status,
      'source_amount',COALESCE(v_existing.source_amount,v_existing.amount),
      'payout_gross_amount',COALESCE(v_existing.payout_gross_amount,v_existing.amount),
      'tax_amount',COALESCE(v_existing.payout_tax_amount,v_existing.tax_amount,0),
      'payout_net_amount',COALESCE(v_existing.payout_net_amount,v_existing.net_amount,v_existing.amount),
      'eligible_at',v_existing.eligible_at);
  END IF;

  v_quote:=public.cp_quote_withdrawal_v23(p_user_id,p_payout_account_id,p_amount);
  v_result:=public.cp_create_withdrawal_request_v11(
    p_user_id,p_payout_account_id,p_amount,p_note,p_request_key,p_hold_hours,
    p_risk_score,p_risk_level,p_risk_reasons,p_device_id,p_security_review_status,
    p_pin_verified_at,p_min_kyc_level
  );
  v_id:=NULLIF(v_result->>'withdrawal_id','')::bigint;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Withdrawal request ID is missing.'; END IF;

  UPDATE public.withdrawal_requests SET
    source_amount=(v_quote->>'source_amount')::numeric,
    source_currency=v_quote->>'source_currency',
    payout_currency=v_quote->>'payout_currency',
    currency=v_quote->>'payout_currency',
    fx_rate=(v_quote->>'fx_rate')::numeric,
    fx_rate_id=NULLIF(v_quote->>'fx_rate_id','')::bigint,
    payout_gross_amount=(v_quote->>'payout_gross_amount')::numeric,
    tax_country_code=v_quote->>'country_code',tax_payout_method=v_quote->>'payout_method',
    tax_rate_percent=(v_quote->>'rate_percent')::numeric,
    tax_fixed_amount=(v_quote->>'fixed_amount')::numeric,
    tax_amount=(v_quote->>'tax_amount')::numeric,payout_tax_amount=(v_quote->>'tax_amount')::numeric,
    tax_rule_id=(v_quote->>'rule_id')::bigint,tax_source_reference=v_quote->>'tax_source_reference',
    net_amount=(v_quote->>'payout_net_amount')::numeric,
    payout_net_amount=(v_quote->>'payout_net_amount')::numeric,updated_at=now()
  WHERE id=v_id AND user_id=p_user_id;

  INSERT INTO public.fx_snapshots(
    source_type,source_id,source_currency,payout_currency,source_amount,rate,payout_amount,
    fx_rate_id,provider,source_reference,metadata
  ) VALUES (
    'withdrawal',v_id::text,v_quote->>'source_currency',v_quote->>'payout_currency',
    (v_quote->>'source_amount')::numeric,(v_quote->>'fx_rate')::numeric,
    (v_quote->>'payout_gross_amount')::numeric,NULLIF(v_quote->>'fx_rate_id','')::bigint,
    v_quote->>'fx_provider',v_quote->>'fx_source_reference',jsonb_build_object('version','v23')
  ) ON CONFLICT(source_type,source_id) DO NOTHING;

  UPDATE public.wallet_transactions SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
    'source_currency',v_quote->>'source_currency','payout_currency',v_quote->>'payout_currency',
    'fx_rate',(v_quote->>'fx_rate')::numeric,'payout_gross_amount',(v_quote->>'payout_gross_amount')::numeric,
    'withdrawal_tax_amount',(v_quote->>'tax_amount')::numeric,
    'payout_net_amount',(v_quote->>'payout_net_amount')::numeric,'version','v23'
  ),updated_at=now()
  WHERE metadata->>'withdrawal_id'=v_id::text AND COALESCE(type,transaction_type)='withdraw_request';

  RETURN v_result||v_quote||jsonb_build_object('withdrawal_id',v_id,'tax_bearer','seller','immutable_fx_snapshot',true);
END;
$$;

-- V23 admin processing preserves the payout quote. Provider fees reported after
-- PayPal submission are platform expenses and do not reduce the seller payout.
CREATE OR REPLACE FUNCTION public.cp_admin_process_withdrawal_v23(
  p_withdrawal_id bigint,
  p_admin_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_fee_amount numeric DEFAULT 0,
  p_override_hold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_action text;
  v_note text;
  v_reference text;
  v_provider text;
  v_status text;
  v_before numeric;
  v_after numeric;
  v_existing_refund bigint;
  v_source numeric;
  v_payout_gross numeric;
  v_tax numeric;
  v_net numeric;
BEGIN
  IF NOT public.cp_is_admin(p_admin_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  v_action:=lower(trim(COALESCE(p_action,'')));
  v_note:=NULLIF(trim(COALESCE(p_note,'')),'');
  v_reference:=NULLIF(trim(COALESCE(p_reference,'')),'');
  v_provider:=NULLIF(trim(COALESCE(p_provider,'')),'');
  IF v_action NOT IN ('approve','processing','paid','reject','fail') THEN RAISE EXCEPTION 'Unsupported withdrawal action.'; END IF;
  IF v_action IN ('reject','fail') AND v_note IS NULL THEN RAISE EXCEPTION 'An admin note is required.'; END IF;
  IF v_action='paid' AND v_reference IS NULL THEN RAISE EXCEPTION 'A payout reference is required.'; END IF;

  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found.'; END IF;
  v_status:=lower(COALESCE(v_request.status,'pending'));
  IF v_status IN ('paid','rejected','failed','cancelled') THEN
    RETURN jsonb_build_object('already_processed',true,'withdrawal_id',v_request.id,'status',v_request.status,
      'tax_amount',COALESCE(v_request.payout_tax_amount,v_request.tax_amount,0),
      'net_amount',COALESCE(v_request.payout_net_amount,v_request.net_amount,0));
  END IF;
  IF v_action='approve' AND v_status<>'pending' THEN RAISE EXCEPTION 'Only pending withdrawals can be approved.'; END IF;
  IF v_action='processing' AND v_status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Only pending or approved withdrawals can enter processing.'; END IF;
  IF v_action='paid' AND v_status NOT IN ('approved','processing') THEN RAISE EXCEPTION 'Only approved or processing withdrawals can be marked paid.'; END IF;
  IF v_action IN ('approve','processing','paid') AND COALESCE(v_request.eligible_at,now())>now() AND NOT COALESCE(p_override_hold,false) THEN
    RAISE EXCEPTION 'Withdrawal hold period has not finished.';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE id=v_request.wallet_id AND user_id=v_request.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found for this withdrawal.'; END IF;
  v_before:=COALESCE(v_wallet.balance,0); v_after:=v_before;
  v_source:=COALESCE(v_request.source_amount,v_request.amount,0);
  v_payout_gross:=COALESCE(v_request.payout_gross_amount,v_request.amount,0);
  v_tax:=LEAST(COALESCE(v_request.payout_tax_amount,v_request.tax_amount,0),v_payout_gross);
  v_net:=COALESCE(v_request.payout_net_amount,v_request.net_amount,GREATEST(v_payout_gross-v_tax,0));

  IF v_action='approve' THEN
    UPDATE public.withdrawal_requests SET status='approved',admin_note=COALESCE(v_note,admin_note),
      payout_provider=COALESCE(v_provider,payout_provider),provider_status='approved',
      approved_at=COALESCE(approved_at,now()),updated_at=now() WHERE id=v_request.id;
  ELSIF v_action='processing' THEN
    UPDATE public.withdrawal_requests SET status='processing',admin_note=COALESCE(v_note,admin_note),
      payout_provider=COALESCE(v_provider,payout_provider),provider_status='processing',
      approved_at=COALESCE(approved_at,now()),processing_at=COALESCE(processing_at,now()),updated_at=now()
    WHERE id=v_request.id;
  ELSIF v_action='paid' THEN
    UPDATE public.withdrawal_requests SET status='paid',admin_note=COALESCE(v_note,admin_note),
      payout_reference=v_reference,payout_provider=COALESCE(v_provider,payout_provider),provider_status='settled',
      payout_provider_fee=GREATEST(COALESCE(p_fee_amount,0),0),approved_at=COALESCE(approved_at,now()),
      processing_at=COALESCE(processing_at,now()),paid_at=now(),processed_at=now(),updated_at=now()
    WHERE id=v_request.id;
    UPDATE public.wallets SET total_withdrawn=COALESCE(total_withdrawn,0)+v_source,updated_at=now() WHERE id=v_wallet.id;
    UPDATE public.wallet_transactions SET type='withdraw_paid',transaction_type='withdraw_paid',status='completed',
      description='Withdrawal paid using immutable V23 tax and FX quote. Reference: '||v_reference,
      metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
        'withdrawal_id',v_request.id,'admin_id',p_admin_id,'payout_reference',v_reference,
        'payout_provider',v_provider,'source_amount',v_source,'payout_gross_amount',v_payout_gross,
        'withdrawal_tax_amount',v_tax,'payout_net_amount',v_net,'provider_fee_platform_expense',GREATEST(COALESCE(p_fee_amount,0),0)
      ),updated_at=now()
    WHERE metadata->>'withdrawal_id'=v_request.id::text
      AND COALESCE(type,transaction_type) IN ('withdraw_request','withdraw_approved');
    INSERT INTO public.seller_tax_ledger(
      seller_id,tax_type,source_type,source_id,taxable_amount,rate_percent,fixed_amount,
      tax_amount,currency,status,country_code,payout_method,metadata,recognized_at,updated_at
    ) VALUES (
      v_request.user_id,'withdrawal_tax','withdrawal',v_request.id::text,v_payout_gross,
      COALESCE(v_request.tax_rate_percent,0),COALESCE(v_request.tax_fixed_amount,0),v_tax,
      COALESCE(v_request.payout_currency,v_request.currency,'IDR'),'withheld',v_request.tax_country_code,
      v_request.tax_payout_method,jsonb_build_object('source_amount',v_source,'fx_rate',v_request.fx_rate,
      'payout_net_amount',v_net,'provider_fee_platform_expense',GREATEST(COALESCE(p_fee_amount,0),0),'reference',v_reference),
      now(),now()
    ) ON CONFLICT(tax_type,source_type,source_id) DO UPDATE SET
      taxable_amount=EXCLUDED.taxable_amount,rate_percent=EXCLUDED.rate_percent,
      fixed_amount=EXCLUDED.fixed_amount,tax_amount=EXCLUDED.tax_amount,currency=EXCLUDED.currency,
      status=EXCLUDED.status,country_code=EXCLUDED.country_code,payout_method=EXCLUDED.payout_method,
      metadata=EXCLUDED.metadata,recognized_at=EXCLUDED.recognized_at,updated_at=now();
  ELSE
    SELECT id INTO v_existing_refund FROM public.wallet_transactions
    WHERE metadata->>'withdrawal_id'=v_request.id::text
      AND COALESCE(type,transaction_type) IN ('withdraw_rejected_refund','withdraw_failed_refund','withdraw_cancelled_refund')
    LIMIT 1;
    IF v_existing_refund IS NULL THEN
      v_after:=v_before+v_source;
      UPDATE public.wallets SET balance=v_after,updated_at=now() WHERE id=v_wallet.id;
      INSERT INTO public.wallet_transactions(
        wallet_id,user_id,type,transaction_type,amount,balance_before,balance_after,status,description,metadata,created_at,updated_at
      ) VALUES (
        v_wallet.id,v_request.user_id,
        CASE WHEN v_action='reject' THEN 'withdraw_rejected_refund' ELSE 'withdraw_failed_refund' END,
        CASE WHEN v_action='reject' THEN 'withdraw_rejected_refund' ELSE 'withdraw_failed_refund' END,
        v_source,v_before,v_after,'completed','Withdrawal did not complete; full source amount returned. '||COALESCE(v_note,''),
        jsonb_build_object('withdrawal_id',v_request.id,'admin_id',p_admin_id),now(),now()
      );
    END IF;
    UPDATE public.withdrawal_requests SET
      status=CASE WHEN v_action='reject' THEN 'rejected' ELSE 'failed' END,
      admin_note=v_note,payout_reference=COALESCE(v_reference,payout_reference),
      payout_provider=COALESCE(v_provider,payout_provider),provider_status=CASE WHEN v_action='reject' THEN 'rejected' ELSE 'failed' END,
      failed_at=CASE WHEN v_action='fail' THEN now() ELSE failed_at END,processed_at=now(),updated_at=now()
    WHERE id=v_request.id;
  END IF;

  INSERT INTO public.notifications(user_id,type,title,message,link_url,is_read)
  VALUES(v_request.user_id,'withdrawal',
    CASE v_action WHEN 'approve' THEN 'Withdrawal Approved' WHEN 'processing' THEN 'Withdrawal Processing'
      WHEN 'paid' THEN 'Withdrawal Paid' WHEN 'reject' THEN 'Withdrawal Rejected' ELSE 'Withdrawal Failed' END,
    'Withdrawal request #'||v_request.id||' status: '||v_action||'.','/seller/payouts',false);
  RETURN jsonb_build_object('already_processed',false,'withdrawal_id',v_request.id,'action',v_action,
    'balance_before',v_before,'balance_after',v_after,'source_amount',v_source,
    'payout_gross_amount',v_payout_gross,'tax_amount',v_tax,'net_amount',v_net);
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_approve_rate_change_v23(
  p_request_id uuid,
  p_admin_id uuid,
  p_decision text DEFAULT 'approve',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_request public.rate_change_requests%ROWTYPE;
  v_decision text;
  v_new_id bigint;
BEGIN
  IF NOT public.cp_is_admin(p_admin_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  v_decision:=lower(trim(COALESCE(p_decision,'approve')));
  IF v_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Decision must be approve or reject.'; END IF;
  SELECT * INTO v_request FROM public.rate_change_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rate change request not found.'; END IF;
  IF v_request.status NOT IN ('pending','partially_approved') THEN RAISE EXCEPTION 'Rate change request is no longer reviewable.'; END IF;
  IF v_request.requested_by=p_admin_id THEN RAISE EXCEPTION 'Requester cannot approve their own rate change.'; END IF;

  IF v_decision='reject' THEN
    UPDATE public.rate_change_requests SET status='rejected',rejected_by=p_admin_id,rejected_at=now(),
      rejection_reason=NULLIF(trim(COALESCE(p_note,'')),''),updated_at=now() WHERE id=p_request_id;
    RETURN jsonb_build_object('request_id',p_request_id,'status','rejected');
  END IF;

  IF v_request.first_approved_by IS NULL THEN
    UPDATE public.rate_change_requests SET first_approved_by=p_admin_id,first_approved_at=now(),
      status='partially_approved',metadata=metadata||jsonb_build_object('first_approval_note',p_note),updated_at=now()
    WHERE id=p_request_id;
    RETURN jsonb_build_object('request_id',p_request_id,'status','partially_approved','approvals',1);
  END IF;
  IF v_request.first_approved_by=p_admin_id THEN RAISE EXCEPTION 'A different second admin is required.'; END IF;

  IF v_request.rate_type='marketplace_fee' THEN
    UPDATE public.marketplace_fee_settings SET valid_to=v_request.effective_from,
      status=CASE WHEN v_request.effective_from<=now() THEN 'inactive' ELSE status END,updated_at=now()
    WHERE setting_key='global_marketplace_fee' AND status IN ('active','scheduled') AND valid_to IS NULL AND valid_from<v_request.effective_from;
    INSERT INTO public.marketplace_fee_settings(
      setting_key,rate_percent,status,valid_from,source_reference,approved_request_id,metadata
    ) VALUES ('global_marketplace_fee',v_request.proposed_rate_percent,
      CASE WHEN v_request.effective_from>now() THEN 'scheduled' ELSE 'active' END,
      v_request.effective_from,v_request.source_reference,v_request.id,
      jsonb_build_object('reason',v_request.reason,'dual_approved',true)) RETURNING id INTO v_new_id;
  ELSIF v_request.rate_type='seller_sales_tax' THEN
    UPDATE public.seller_sales_tax_rates SET valid_to=v_request.effective_from,
      status=CASE WHEN v_request.effective_from<=now() THEN 'inactive' ELSE status END,updated_at=now()
    WHERE setting_key='global_seller_sales_tax' AND status IN ('active','scheduled') AND valid_to IS NULL AND valid_from<v_request.effective_from;
    INSERT INTO public.seller_sales_tax_rates(
      setting_key,rate_percent,status,valid_from,source_reference,approved_request_id,metadata
    ) VALUES ('global_seller_sales_tax',v_request.proposed_rate_percent,
      CASE WHEN v_request.effective_from>now() THEN 'scheduled' ELSE 'active' END,
      v_request.effective_from,v_request.source_reference,v_request.id,
      jsonb_build_object('reason',v_request.reason,'dual_approved',true)) RETURNING id INTO v_new_id;
    IF v_request.effective_from<=now() THEN
      UPDATE public.seller_tax_settings SET sales_tax_rate_percent=v_request.proposed_rate_percent,
        source_reference=v_request.source_reference,valid_from=v_request.effective_from,
        metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('approved_request_id',v_request.id),updated_at=now()
      WHERE setting_key='global_seller_sales_tax';
    END IF;
  ELSE
    UPDATE public.withdrawal_tax_rates SET valid_to=v_request.effective_from,
      status=CASE WHEN v_request.effective_from<=now() THEN 'inactive' ELSE status END,updated_at=now()
    WHERE country_code=v_request.country_code AND payout_method=v_request.payout_method
      AND currency=v_request.currency AND status='active' AND valid_to IS NULL AND valid_from<v_request.effective_from;
    INSERT INTO public.withdrawal_tax_rates(
      country_code,payout_method,rate_percent,fixed_amount,currency,status,valid_from,
      source_reference,metadata
    ) VALUES (
      v_request.country_code,v_request.payout_method,v_request.proposed_rate_percent,
      v_request.proposed_fixed_amount,v_request.currency,'active',v_request.effective_from,
      v_request.source_reference,jsonb_build_object('approved_request_id',v_request.id,'dual_approved',true,'reason',v_request.reason)
    ) RETURNING id INTO v_new_id;
  END IF;

  UPDATE public.rate_change_requests SET second_approved_by=p_admin_id,second_approved_at=now(),
    status='applied',applied_at=now(),metadata=metadata||jsonb_build_object('second_approval_note',p_note,'applied_record_id',v_new_id),updated_at=now()
  WHERE id=p_request_id;
  RETURN jsonb_build_object('request_id',p_request_id,'status','applied','approvals',2,'applied_record_id',v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_generate_seller_tax_statement_v23(
  p_seller_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_currency text,
  p_accounting_period_id uuid DEFAULT NULL,
  p_close boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_currency text;
  v_statement public.seller_tax_statements%ROWTYPE;
  v_number text;
  v_sales_base numeric:=0;
  v_sales_tax numeric:=0;
  v_withdrawal_base numeric:=0;
  v_withdrawal_tax numeric:=0;
  v_count integer:=0;
BEGIN
  IF p_period_end<=p_period_start THEN RAISE EXCEPTION 'Statement period end must be after start.'; END IF;
  v_currency:=upper(trim(COALESCE(p_currency,'')));
  IF v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Statement currency is invalid.'; END IF;
  SELECT * INTO v_statement FROM public.seller_tax_statements
  WHERE seller_id=p_seller_id AND period_start=p_period_start AND period_end=p_period_end AND currency=v_currency FOR UPDATE;
  IF FOUND AND v_statement.status='closed' THEN
    RETURN jsonb_build_object('statement_id',v_statement.id,'statement_number',v_statement.statement_number,
      'status','closed','line_count',v_statement.line_count,'total_tax_amount',v_statement.total_tax_amount,'already_closed',true);
  END IF;
  v_number:='CP-TAX-'||to_char(p_period_start,'YYYYMM')||'-'||substr(replace(p_seller_id::text,'-',''),1,10)||'-'||v_currency;
  IF NOT FOUND THEN
    INSERT INTO public.seller_tax_statements(
      statement_number,accounting_period_id,seller_id,period_start,period_end,currency,status
    ) VALUES(v_number,p_accounting_period_id,p_seller_id,p_period_start,p_period_end,v_currency,CASE WHEN p_close THEN 'closed' ELSE 'open' END)
    RETURNING * INTO v_statement;
  ELSE
    UPDATE public.seller_tax_statements SET accounting_period_id=COALESCE(p_accounting_period_id,accounting_period_id),updated_at=now()
    WHERE id=v_statement.id RETURNING * INTO v_statement;
  END IF;
  DELETE FROM public.seller_tax_statement_lines WHERE statement_id=v_statement.id;
  INSERT INTO public.seller_tax_statement_lines(
    statement_id,ledger_id,tax_type,source_type,source_id,taxable_amount,rate_percent,
    fixed_amount,tax_amount,currency,recognized_at,metadata
  )
  SELECT v_statement.id,l.id,l.tax_type,l.source_type,l.source_id,l.taxable_amount,
    l.rate_percent,l.fixed_amount,l.tax_amount,l.currency,l.recognized_at,l.metadata
  FROM public.seller_tax_ledger l
  WHERE l.seller_id=p_seller_id AND l.currency=v_currency
    AND l.recognized_at>=p_period_start AND l.recognized_at<p_period_end
    AND l.status='withheld';

  SELECT
    COALESCE(sum(taxable_amount) FILTER(WHERE tax_type='sales_tax'),0),
    COALESCE(sum(tax_amount) FILTER(WHERE tax_type='sales_tax'),0),
    COALESCE(sum(taxable_amount) FILTER(WHERE tax_type='withdrawal_tax'),0),
    COALESCE(sum(tax_amount) FILTER(WHERE tax_type='withdrawal_tax'),0),count(*)
  INTO v_sales_base,v_sales_tax,v_withdrawal_base,v_withdrawal_tax,v_count
  FROM public.seller_tax_statement_lines WHERE statement_id=v_statement.id;

  UPDATE public.seller_tax_statements SET
    sales_taxable_amount=v_sales_base,sales_tax_amount=v_sales_tax,
    withdrawal_taxable_amount=v_withdrawal_base,withdrawal_tax_amount=v_withdrawal_tax,
    total_tax_amount=v_sales_tax+v_withdrawal_tax,line_count=v_count,
    status=CASE WHEN p_close THEN 'closed' ELSE 'open' END,
    closed_at=CASE WHEN p_close THEN now() ELSE NULL END,updated_at=now()
  WHERE id=v_statement.id;
  RETURN jsonb_build_object('statement_id',v_statement.id,'statement_number',v_number,
    'status',CASE WHEN p_close THEN 'closed' ELSE 'open' END,'line_count',v_count,
    'sales_tax_amount',v_sales_tax,'withdrawal_tax_amount',v_withdrawal_tax,
    'total_tax_amount',v_sales_tax+v_withdrawal_tax);
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_close_accounting_period_v23(
  p_period_id uuid,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_period public.accounting_periods%ROWTYPE;
  v_row record;
  v_count integer:=0;
BEGIN
  IF NOT public.cp_is_admin(p_admin_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  SELECT * INTO v_period FROM public.accounting_periods WHERE id=p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting period not found.'; END IF;
  IF v_period.status='closed' THEN RETURN jsonb_build_object('period_id',v_period.id,'status','closed','already_closed',true); END IF;
  IF v_period.period_end>now() THEN RAISE EXCEPTION 'Accounting period cannot close before its end timestamp.'; END IF;
  UPDATE public.accounting_periods SET status='closing',updated_at=now() WHERE id=v_period.id;
  FOR v_row IN
    SELECT DISTINCT seller_id,currency FROM public.seller_tax_ledger
    WHERE recognized_at>=v_period.period_start AND recognized_at<v_period.period_end AND status='withheld'
  LOOP
    PERFORM public.cp_generate_seller_tax_statement_v23(
      v_row.seller_id,v_period.period_start,v_period.period_end,v_row.currency,v_period.id,true
    );
    v_count:=v_count+1;
  END LOOP;
  UPDATE public.accounting_periods SET status='closed',closed_by=p_admin_id,closed_at=now(),
    metadata=metadata||jsonb_build_object('statement_count',v_count),updated_at=now()
  WHERE id=v_period.id;
  RETURN jsonb_build_object('period_id',v_period.id,'status','closed','statement_count',v_count);
END;
$$;

-- New unpaid orders receive a V23 snapshot. Paid orders keep their historical V22 backfill.
DO $$
DECLARE v_row record;
BEGIN
  FOR v_row IN
    SELECT o.id,o.buyer_id FROM public.orders o
    WHERE lower(COALESCE(o.payment_status,'unpaid'))<>'paid' AND o.buyer_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.order_pricing_snapshots s WHERE s.order_id=o.id)
  LOOP
    BEGIN
      PERFORM public.cp_apply_seller_tax_v23(v_row.id,v_row.buyer_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped unpaid order % during V23 snapshot: %',v_row.id,SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER TABLE public.marketplace_fee_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_sales_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_pricing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_tax_residencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_tax_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_tax_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_execution_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_fee_settings_read ON public.marketplace_fee_settings;
CREATE POLICY marketplace_fee_settings_read ON public.marketplace_fee_settings FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS seller_sales_tax_rates_read ON public.seller_sales_tax_rates;
CREATE POLICY seller_sales_tax_rates_read ON public.seller_sales_tax_rates FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS seller_tax_residency_own ON public.seller_tax_residencies;
CREATE POLICY seller_tax_residency_own ON public.seller_tax_residencies FOR SELECT TO authenticated USING(seller_id=auth.uid() OR public.cp_is_admin(auth.uid()));
DROP POLICY IF EXISTS seller_tax_statements_own ON public.seller_tax_statements;
CREATE POLICY seller_tax_statements_own ON public.seller_tax_statements FOR SELECT TO authenticated USING(seller_id=auth.uid() OR public.cp_is_admin(auth.uid()));
DROP POLICY IF EXISTS seller_tax_statement_lines_own ON public.seller_tax_statement_lines;
CREATE POLICY seller_tax_statement_lines_own ON public.seller_tax_statement_lines FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.seller_tax_statements s WHERE s.id=statement_id AND (s.seller_id=auth.uid() OR public.cp_is_admin(auth.uid())))
);

REVOKE INSERT,UPDATE,DELETE ON public.marketplace_fee_settings,public.seller_sales_tax_rates,
  public.rate_change_requests,public.order_pricing_snapshots,public.seller_tax_residencies,
  public.fx_rates,public.fx_snapshots,public.accounting_periods,public.seller_tax_statements,
  public.seller_tax_statement_lines,public.payout_execution_attempts FROM anon,authenticated;
GRANT SELECT ON public.marketplace_fee_settings,public.seller_sales_tax_rates,
  public.seller_tax_residencies,public.seller_tax_statements,public.seller_tax_statement_lines TO authenticated;

REVOKE ALL ON FUNCTION public.cp_apply_seller_tax_v23(bigint,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_order_and_release_escrow_v23(bigint,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cp_quote_withdrawal_v23(uuid,bigint,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cp_create_withdrawal_request_v23(uuid,bigint,numeric,text,uuid,integer,integer,text,jsonb,uuid,text,timestamptz,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cp_admin_process_withdrawal_v23(bigint,uuid,text,text,text,text,numeric,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cp_approve_rate_change_v23(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cp_generate_seller_tax_statement_v23(uuid,timestamptz,timestamptz,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cp_close_accounting_period_v23(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cp_apply_seller_tax_v23(bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_and_release_escrow_v23(bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_quote_withdrawal_v23(uuid,bigint,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_create_withdrawal_request_v23(uuid,bigint,numeric,text,uuid,integer,integer,text,jsonb,uuid,text,timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_admin_process_withdrawal_v23(bigint,uuid,text,text,text,text,numeric,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_approve_rate_change_v23(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_generate_seller_tax_statement_v23(uuid,timestamptz,timestamptz,text,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_close_accounting_period_v23(uuid,uuid) TO service_role;

ALTER TABLE public.launch_signoffs
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO public.launch_signoffs(area,label,status,note,metadata)
VALUES
  ('immutable_pricing','Order marketplace-fee and seller-tax snapshots verified','pending',NULL,'{"introduced_in":"v23"}'::jsonb),
  ('rate_dual_approval','Two-person approval for fee and tax changes verified','pending',NULL,'{"introduced_in":"v23"}'::jsonb),
  ('tax_residency','Seller tax-residency verification and encryption verified','pending',NULL,'{"introduced_in":"v23"}'::jsonb),
  ('accounting_close','Seller statements and accounting-period close verified','pending',NULL,'{"introduced_in":"v23"}'::jsonb),
  ('provider_payout_execution','Provider payout execution and synchronization verified','pending',NULL,'{"introduced_in":"v23"}'::jsonb)
ON CONFLICT(area) DO UPDATE SET
  label=EXCLUDED.label,status='pending',note=NULL,signed_at=NULL,
  metadata=COALESCE(public.launch_signoffs.metadata,'{}'::jsonb)||EXCLUDED.metadata,updated_at=now();

COMMIT;

SELECT 'comeplayers_finance_governance_v23_ready' AS status;
