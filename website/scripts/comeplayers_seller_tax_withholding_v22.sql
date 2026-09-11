-- ComePlayers V22 — seller-borne sales tax and country/method withdrawal withholding
-- Apply after V21. Buyer checkout tax is disabled for new orders.
-- The 5% seller sales tax is a platform accounting rule; review legal treatment per jurisdiction.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_invoices') IS NULL
     OR to_regclass('public.order_tax_snapshots') IS NULL
     OR to_regclass('public.user_billing_profiles') IS NULL
     OR to_regclass('public.withdrawal_requests') IS NULL
     OR to_regclass('public.payout_accounts') IS NULL
     OR to_regclass('public.launch_signoffs') IS NULL THEN
    RAISE EXCEPTION 'ComePlayers V22 requires all migrations through V21. Apply and verify V21 before retrying.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.seller_tax_settings (
  setting_key text PRIMARY KEY,
  sales_tax_rate_percent numeric(8,4) NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_tax_settings_fixed_rate CHECK (sales_tax_rate_percent = 5)
);

INSERT INTO public.seller_tax_settings (
  setting_key, sales_tax_rate_percent, status, source_reference, metadata
) VALUES (
  'global_seller_sales_tax', 5, 'active',
  'ComePlayers owner policy: seller-borne sales tax fixed at 5%',
  '{"introduced_in":"v22","tax_bearer":"seller"}'::jsonb
)
ON CONFLICT (setting_key) DO UPDATE SET
  sales_tax_rate_percent = 5,
  status = 'active',
  source_reference = EXCLUDED.source_reference,
  metadata = COALESCE(public.seller_tax_settings.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_gross_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_sales_tax_rate_percent numeric(8,4) DEFAULT 5,
  ADD COLUMN IF NOT EXISTS seller_sales_tax_amount numeric DEFAULT 0;

ALTER TABLE public.order_invoices
  ADD COLUMN IF NOT EXISTS seller_gross_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_marketplace_fee_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_sales_tax_rate_percent numeric(8,4) DEFAULT 5,
  ADD COLUMN IF NOT EXISTS seller_sales_tax_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_net_amount numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.seller_sales_tax_snapshots (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL UNIQUE,
  seller_id uuid NOT NULL,
  taxable_amount numeric NOT NULL DEFAULT 0,
  rate_percent numeric(8,4) NOT NULL DEFAULT 5,
  tax_amount numeric NOT NULL DEFAULT 0,
  tax_bearer text NOT NULL DEFAULT 'seller',
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_sales_tax_snapshots_seller_idx
  ON public.seller_sales_tax_snapshots(seller_id, calculated_at DESC);

-- Paid orders that predate V22 remain on their historical tax model. Explicitly
-- set their new seller-tax columns to zero so the additive column defaults do
-- not make legacy invoices appear to have used the V22 5% withholding.
UPDATE public.orders AS o
SET seller_sales_tax_rate_percent = 0,
    seller_sales_tax_amount = 0,
    updated_at = now()
WHERE lower(COALESCE(o.payment_status, 'unpaid')) = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.seller_sales_tax_snapshots s WHERE s.order_id = o.id
  );

UPDATE public.order_invoices AS i
SET seller_sales_tax_rate_percent = 0,
    seller_sales_tax_amount = 0,
    updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.seller_sales_tax_snapshots s WHERE s.order_id = i.order_id
);

CREATE TABLE IF NOT EXISTS public.withdrawal_tax_rates (
  id bigserial PRIMARY KEY,
  country_code text NOT NULL,
  payout_method text NOT NULL,
  rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  fixed_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'draft',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT withdrawal_tax_rates_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT withdrawal_tax_rates_method_check CHECK (payout_method ~ '^[a-z0-9_-]{2,40}$'),
  CONSTRAINT withdrawal_tax_rates_rate_check CHECK (rate_percent >= 0 AND rate_percent <= 100),
  CONSTRAINT withdrawal_tax_rates_fixed_check CHECK (fixed_amount >= 0),
  CONSTRAINT withdrawal_tax_rates_window_check CHECK (valid_to IS NULL OR valid_to > valid_from)
);

DROP INDEX IF EXISTS public.withdrawal_tax_rates_unique_window_idx;
CREATE UNIQUE INDEX withdrawal_tax_rates_unique_window_idx
  ON public.withdrawal_tax_rates(country_code, payout_method, currency, valid_from);
DROP INDEX IF EXISTS public.withdrawal_tax_rates_lookup_idx;
CREATE INDEX withdrawal_tax_rates_lookup_idx
  ON public.withdrawal_tax_rates(country_code, payout_method, currency, status, valid_from DESC);

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS tax_country_code text,
  ADD COLUMN IF NOT EXISTS tax_payout_method text,
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_fixed_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rule_id bigint,
  ADD COLUMN IF NOT EXISTS tax_source_reference text;

CREATE TABLE IF NOT EXISTS public.seller_tax_ledger (
  id bigserial PRIMARY KEY,
  seller_id uuid NOT NULL,
  tax_type text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  taxable_amount numeric NOT NULL DEFAULT 0,
  rate_percent numeric(8,4) NOT NULL DEFAULT 0,
  fixed_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'withheld',
  country_code text,
  payout_method text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  recognized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_tax_ledger_source_unique_idx
  ON public.seller_tax_ledger(tax_type, source_type, source_id);
CREATE INDEX IF NOT EXISTS seller_tax_ledger_seller_idx
  ON public.seller_tax_ledger(seller_id, recognized_at DESC);

-- V21 buyer-country rates are retained for audit history but are no longer used
-- by new checkout calculations.
UPDATE public.tax_rates
SET status = 'inactive',
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"disabled_by":"v22_seller_borne_tax"}'::jsonb,
    updated_at = now()
WHERE lower(COALESCE(status, '')) = 'active';

CREATE OR REPLACE FUNCTION public.cp_apply_seller_tax_v22(
  p_order_id bigint,
  p_buyer_id uuid,
  p_fee_rate numeric DEFAULT 0.05
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_billing public.user_billing_profiles%ROWTYPE;
  v_rate numeric := 5;
  v_seller_gross numeric := 0;
  v_seller_tax numeric := 0;
  v_fee_rate numeric := 0.05;
  v_marketplace_fee numeric := 0;
  v_seller_net numeric := 0;
  v_total numeric := 0;
  v_invoice text;
  v_buyer jsonb := '{}'::jsonb;
  v_seller jsonb := '{}'::jsonb;
  v_buyer_country text := 'ID';
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Buyer mismatch for this order.';
  END IF;
  IF lower(COALESCE(v_order.payment_status, 'unpaid')) = 'paid' THEN
    RAISE EXCEPTION 'Seller tax cannot be recalculated after payment.';
  END IF;

  SELECT sales_tax_rate_percent INTO v_rate
  FROM public.seller_tax_settings
  WHERE setting_key = 'global_seller_sales_tax'
    AND lower(status) = 'active';
  v_rate := COALESCE(v_rate, 5);

  SELECT * INTO v_billing
  FROM public.user_billing_profiles
  WHERE user_id = p_buyer_id;
  v_buyer_country := upper(COALESCE(NULLIF(v_billing.country_code, ''), 'ID'));

  v_seller_gross := round(GREATEST(
    0,
    COALESCE(v_order.subtotal_amount, 0) - COALESCE(v_order.discount_amount, 0)
  ), 2);
  v_seller_tax := round(v_seller_gross * v_rate / 100, 2);
  v_fee_rate := LEAST(0.5, GREATEST(0, COALESCE(p_fee_rate, 0.05)));
  v_marketplace_fee := round(v_seller_gross * v_fee_rate, 2);
  v_seller_net := round(GREATEST(0, v_seller_gross - v_marketplace_fee - v_seller_tax), 2);
  v_total := round(v_seller_gross + COALESCE(v_order.payment_fee_amount, 0), 2);

  IF v_total <= 0 THEN RAISE EXCEPTION 'Order total is invalid.'; END IF;

  v_invoice := 'CP-' || to_char(COALESCE(v_order.created_at, now()), 'YYYY') || '-' || lpad(v_order.id::text, 10, '0');

  SELECT jsonb_build_object(
    'id', p.id, 'email', p.email, 'username', p.username, 'full_name', p.full_name
  ) INTO v_buyer
  FROM public.profiles p WHERE p.id = v_order.buyer_id;

  SELECT jsonb_build_object(
    'id', p.id, 'email', p.email, 'username', p.username, 'seller_name', p.seller_name
  ) INTO v_seller
  FROM public.profiles p WHERE p.id = v_order.seller_id;

  UPDATE public.orders
  SET taxable_amount = 0,
      tax_amount = 0,
      tax_rate_percent = 0,
      tax_country_code = NULL,
      seller_gross_amount = v_seller_gross,
      seller_sales_tax_rate_percent = v_rate,
      seller_sales_tax_amount = v_seller_tax,
      marketplace_fee_amount = v_marketplace_fee,
      seller_earning_amount = v_seller_net,
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
    p_order_id, p_buyer_id, v_buyer_country, NULL, 'digital_goods', 0,
    false, 0, 0, NULL, 'v22_buyer_tax_disabled',
    jsonb_build_object('configured', true, 'tax_bearer', 'seller'), now(), now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    country_code = EXCLUDED.country_code,
    region_code = NULL,
    rate_percent = 0,
    inclusive = false,
    taxable_amount = 0,
    tax_amount = 0,
    rule_id = NULL,
    rule_source = EXCLUDED.rule_source,
    metadata = EXCLUDED.metadata,
    calculated_at = now(),
    updated_at = now();

  INSERT INTO public.seller_sales_tax_snapshots (
    order_id, seller_id, taxable_amount, rate_percent, tax_amount,
    tax_bearer, source_reference, metadata, calculated_at, updated_at
  ) VALUES (
    p_order_id, v_order.seller_id, v_seller_gross, v_rate, v_seller_tax,
    'seller', 'ComePlayers fixed seller sales tax',
    jsonb_build_object('version', 'v22', 'buyer_tax_amount', 0), now(), now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    seller_id = EXCLUDED.seller_id,
    taxable_amount = EXCLUDED.taxable_amount,
    rate_percent = EXCLUDED.rate_percent,
    tax_amount = EXCLUDED.tax_amount,
    source_reference = EXCLUDED.source_reference,
    metadata = EXCLUDED.metadata,
    calculated_at = now(),
    updated_at = now();

  INSERT INTO public.order_invoices (
    invoice_number, order_id, buyer_id, seller_id, currency_code,
    subtotal_amount, discount_amount, payment_fee_amount, taxable_amount,
    tax_amount, total_amount, tax_country_code, tax_rate_percent,
    seller_gross_amount, seller_marketplace_fee_amount,
    seller_sales_tax_rate_percent, seller_sales_tax_amount, seller_net_amount,
    buyer_snapshot, seller_snapshot, status, issued_at, metadata, updated_at
  ) VALUES (
    v_invoice, p_order_id, v_order.buyer_id, v_order.seller_id,
    COALESCE(v_order.currency_code, 'IDR'), COALESCE(v_order.subtotal_amount, 0),
    COALESCE(v_order.discount_amount, 0), COALESCE(v_order.payment_fee_amount, 0),
    0, 0, v_total, NULL, 0,
    v_seller_gross, v_marketplace_fee, v_rate, v_seller_tax, v_seller_net,
    COALESCE(v_buyer, '{}'::jsonb) || jsonb_build_object(
      'billing', jsonb_build_object(
        'legal_name', v_billing.legal_name,
        'address_line_1', v_billing.address_line_1,
        'address_line_2', v_billing.address_line_2,
        'city', v_billing.city,
        'state', v_billing.state,
        'postal_code', v_billing.postal_code,
        'country_code', v_billing.country_code
      )
    ),
    COALESCE(v_seller, '{}'::jsonb), 'issued', now(),
    jsonb_build_object('tax_bearer', 'seller', 'seller_sales_tax_rate_percent', v_rate, 'marketplace_fee_rate', v_fee_rate),
    now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    subtotal_amount = EXCLUDED.subtotal_amount,
    discount_amount = EXCLUDED.discount_amount,
    payment_fee_amount = EXCLUDED.payment_fee_amount,
    taxable_amount = 0,
    tax_amount = 0,
    total_amount = EXCLUDED.total_amount,
    tax_country_code = NULL,
    tax_rate_percent = 0,
    seller_gross_amount = EXCLUDED.seller_gross_amount,
    seller_marketplace_fee_amount = EXCLUDED.seller_marketplace_fee_amount,
    seller_sales_tax_rate_percent = EXCLUDED.seller_sales_tax_rate_percent,
    seller_sales_tax_amount = EXCLUDED.seller_sales_tax_amount,
    seller_net_amount = EXCLUDED.seller_net_amount,
    buyer_snapshot = EXCLUDED.buyer_snapshot,
    seller_snapshot = EXCLUDED.seller_snapshot,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN jsonb_build_object(
    'id', p_order_id,
    'invoice_number', v_invoice,
    'buyer_tax_amount', 0,
    'seller_gross_amount', v_seller_gross,
    'seller_sales_tax_rate_percent', v_rate,
    'seller_sales_tax_amount', v_seller_tax,
    'marketplace_fee_amount', v_marketplace_fee,
    'seller_net_amount', v_seller_net,
    'total', v_total,
    'tax_bearer', 'seller'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_order_and_release_escrow_v22(
  p_order_id bigint,
  p_buyer_id uuid,
  p_fee_rate numeric DEFAULT 0.05
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_seller_wallet public.wallets%ROWTYPE;
  v_seller_gross numeric;
  v_fee_rate numeric;
  v_fee numeric;
  v_tax_rate numeric := 5;
  v_tax numeric;
  v_seller_earning numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_transaction_id bigint;
  v_v22_tax_model boolean := false;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.seller_sales_tax_snapshots
    WHERE order_id = p_order_id
  ) INTO v_v22_tax_model;

  IF v_order.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'Only the buyer can complete this order.';
  END IF;

  IF lower(COALESCE(v_order.status, '')) = 'completed'
     OR lower(COALESCE(v_order.escrow_status, '')) = 'released' THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'seller_id', v_order.seller_id,
      'seller_gross', COALESCE(v_order.seller_gross_amount, 0),
      'seller_earning', COALESCE(v_order.seller_earning_amount, 0),
      'marketplace_fee', COALESCE(v_order.marketplace_fee_amount, 0),
      'seller_sales_tax', COALESCE(v_order.seller_sales_tax_amount, 0),
      'seller_sales_tax_rate_percent', CASE
        WHEN v_v22_tax_model THEN COALESCE(v_order.seller_sales_tax_rate_percent, 5)
        ELSE 0
      END,
      'order_id', v_order.id
    );
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) <> 'paid' THEN
    RAISE EXCEPTION 'Order must be paid before completion.';
  END IF;
  IF lower(COALESCE(v_order.status, '')) <> 'delivered' THEN
    RAISE EXCEPTION 'Order must be delivered before buyer confirmation.';
  END IF;
  IF v_order.seller_id IS NULL THEN RAISE EXCEPTION 'Seller ID is missing on this order.'; END IF;

  IF v_v22_tax_model THEN
    SELECT sales_tax_rate_percent INTO v_tax_rate
    FROM public.seller_tax_settings
    WHERE setting_key = 'global_seller_sales_tax' AND lower(status) = 'active';
    v_tax_rate := COALESCE(v_tax_rate, 5);
  ELSE
    -- Paid orders created before V22 keep their historical buyer-tax treatment.
    -- They still use the corrected seller gross (excluding buyer payment fee), but
    -- V22 does not introduce a retroactive seller tax.
    v_tax_rate := 0;
  END IF;

  v_seller_gross := round(GREATEST(0, COALESCE(
    NULLIF(v_order.seller_gross_amount, 0),
    NULLIF(COALESCE(v_order.subtotal_amount, 0) - COALESCE(v_order.discount_amount, 0), 0),
    NULLIF(
      COALESCE(v_order.total_amount, v_order.total_price, 0)
        - COALESCE(v_order.payment_fee_amount, 0)
        - COALESCE(v_order.tax_amount, 0),
      0
    ),
    0
  )), 2);
  IF v_seller_gross <= 0 THEN RAISE EXCEPTION 'Seller gross amount is invalid.'; END IF;

  v_fee_rate := LEAST(0.5, GREATEST(0, COALESCE(p_fee_rate, 0.05)));
  v_fee := round(v_seller_gross * v_fee_rate, 2);
  v_tax := round(v_seller_gross * v_tax_rate / 100, 2);
  v_seller_earning := round(GREATEST(0, v_seller_gross - v_fee - v_tax), 2);

  INSERT INTO public.wallets (user_id, balance, pending_balance, created_at, updated_at)
  VALUES (v_order.seller_id, 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_seller_wallet
  FROM public.wallets
  WHERE user_id = v_order.seller_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller wallet could not be created.'; END IF;

  v_balance_before := COALESCE(v_seller_wallet.balance, 0);
  v_balance_after := v_balance_before + v_seller_earning;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, order_id, type, transaction_type, amount,
    balance_before, balance_after, status, description, metadata
  ) VALUES (
    v_seller_wallet.id, v_order.seller_id, p_order_id,
    'seller_order_payout', 'seller_order_payout', v_seller_earning,
    v_balance_before, v_balance_after, 'completed',
    CASE
      WHEN v_v22_tax_model THEN 'Seller proceeds after marketplace fee and 5% seller sales tax'
      ELSE 'Seller proceeds after marketplace fee; no retroactive V22 seller tax'
    END,
    jsonb_build_object(
      'seller_gross_amount', v_seller_gross,
      'marketplace_fee', v_fee,
      'marketplace_fee_rate', v_fee_rate,
      'seller_sales_tax', v_tax,
      'seller_sales_tax_rate_percent', v_tax_rate,
      'buyer_total', COALESCE(v_order.total_amount, v_order.total_price, 0),
      'payment_fee', COALESCE(v_order.payment_fee_amount, 0),
      'tax_bearer', CASE WHEN v_v22_tax_model THEN 'seller' ELSE 'legacy_buyer_model' END
    )
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'seller_id', v_order.seller_id,
      'seller_gross', COALESCE(v_order.seller_gross_amount, v_seller_gross),
      'seller_earning', COALESCE(v_order.seller_earning_amount, v_seller_earning),
      'marketplace_fee', COALESCE(v_order.marketplace_fee_amount, v_fee),
      'seller_sales_tax', COALESCE(v_order.seller_sales_tax_amount, v_tax),
      'seller_sales_tax_rate_percent', CASE
        WHEN v_v22_tax_model THEN COALESCE(v_order.seller_sales_tax_rate_percent, v_tax_rate)
        ELSE 0
      END,
      'order_id', v_order.id
    );
  END IF;

  UPDATE public.wallets
  SET balance = v_balance_after,
      total_earned = COALESCE(total_earned, 0) + v_seller_earning,
      updated_at = now()
  WHERE id = v_seller_wallet.id;

  UPDATE public.orders
  SET status = 'completed',
      payment_status = 'paid',
      escrow_status = 'released',
      seller_payout_status = 'released',
      seller_gross_amount = v_seller_gross,
      marketplace_fee_amount = v_fee,
      seller_sales_tax_rate_percent = v_tax_rate,
      seller_sales_tax_amount = v_tax,
      seller_earning_amount = v_seller_earning,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.order_invoices
  SET seller_gross_amount = v_seller_gross,
      seller_marketplace_fee_amount = v_fee,
      seller_sales_tax_rate_percent = v_tax_rate,
      seller_sales_tax_amount = v_tax,
      seller_net_amount = v_seller_earning,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'tax_bearer', CASE WHEN v_v22_tax_model THEN 'seller' ELSE 'legacy_buyer_model' END,
        'seller_tax_retroactive', false,
        'settled_at', now()
      ),
      updated_at = now()
  WHERE order_id = p_order_id;

  IF v_v22_tax_model THEN
    INSERT INTO public.seller_tax_ledger (
      seller_id, tax_type, source_type, source_id, taxable_amount,
      rate_percent, fixed_amount, tax_amount, currency, status,
      metadata, recognized_at, updated_at
    ) VALUES (
      v_order.seller_id, 'sales_tax', 'order', p_order_id::text,
      v_seller_gross, v_tax_rate, 0, v_tax,
      COALESCE(v_order.currency_code, 'IDR'), 'withheld',
      jsonb_build_object('marketplace_fee', v_fee, 'seller_net', v_seller_earning),
      now(), now()
    )
    ON CONFLICT (tax_type, source_type, source_id) DO UPDATE SET
      taxable_amount = EXCLUDED.taxable_amount,
      rate_percent = EXCLUDED.rate_percent,
      tax_amount = EXCLUDED.tax_amount,
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata,
      recognized_at = EXCLUDED.recognized_at,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'already_completed', false,
    'seller_id', v_order.seller_id,
    'seller_gross', v_seller_gross,
    'seller_earning', v_seller_earning,
    'marketplace_fee', v_fee,
    'seller_sales_tax', v_tax,
    'seller_sales_tax_rate_percent', v_tax_rate,
    'order_id', v_order.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_quote_withdrawal_tax_v22(
  p_user_id uuid,
  p_payout_account_id bigint,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.payout_accounts%ROWTYPE;
  v_rule public.withdrawal_tax_rates%ROWTYPE;
  v_amount numeric;
  v_tax numeric;
  v_net numeric;
  v_country text;
  v_method text;
BEGIN
  SELECT * INTO v_account
  FROM public.payout_accounts
  WHERE id = p_payout_account_id
    AND user_id = p_user_id
    AND lower(COALESCE(status, 'active')) = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active payout account not found.'; END IF;

  v_amount := round(GREATEST(COALESCE(p_amount, 0), 0), 2);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Withdrawal amount must be positive.'; END IF;

  v_country := upper(COALESCE(NULLIF(v_account.country_code, ''), 'ID'));
  v_method := lower(COALESCE(NULLIF(v_account.method, ''), 'bank_transfer'));

  SELECT * INTO v_rule
  FROM public.withdrawal_tax_rates
  WHERE country_code = v_country
    AND payout_method = v_method
    AND upper(currency) = upper(COALESCE(v_account.currency, 'IDR'))
    AND lower(status) = 'active'
    AND valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY valid_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal tax rate is not configured for country % and method %.', v_country, v_method;
  END IF;

  IF upper(COALESCE(v_rule.currency, COALESCE(v_account.currency, 'IDR')))
     <> upper(COALESCE(v_account.currency, 'IDR')) THEN
    RAISE EXCEPTION 'Withdrawal tax rule currency does not match the payout account currency.';
  END IF;

  v_tax := round(LEAST(
    v_amount,
    v_amount * COALESCE(v_rule.rate_percent, 0) / 100 + COALESCE(v_rule.fixed_amount, 0)
  ), 2);
  v_net := round(GREATEST(v_amount - v_tax, 0), 2);

  RETURN jsonb_build_object(
    'amount', v_amount,
    'country_code', v_country,
    'payout_method', v_method,
    'currency', COALESCE(v_account.currency, 'IDR'),
    'rate_percent', COALESCE(v_rule.rate_percent, 0),
    'fixed_amount', COALESCE(v_rule.fixed_amount, 0),
    'tax_amount', v_tax,
    'net_amount', v_net,
    'rule_id', v_rule.id,
    'source_reference', v_rule.source_reference
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_create_withdrawal_request_v22(
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
  v_quote jsonb;
  v_result jsonb;
  v_withdrawal_id bigint;
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.withdrawal_requests
  WHERE request_key = p_request_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'already_created', true,
      'withdrawal_id', v_request.id,
      'status', v_request.status,
      'amount', v_request.amount,
      'tax_amount', COALESCE(v_request.tax_amount, 0),
      'fee_amount', COALESCE(v_request.fee_amount, 0),
      'net_amount', COALESCE(v_request.net_amount, v_request.amount),
      'eligible_at', v_request.eligible_at
    );
  END IF;

  v_quote := public.cp_quote_withdrawal_tax_v22(
    p_user_id, p_payout_account_id, p_amount
  );

  v_result := public.cp_create_withdrawal_request_v11(
    p_user_id, p_payout_account_id, p_amount, p_note, p_request_key,
    p_hold_hours, p_risk_score, p_risk_level, p_risk_reasons,
    p_device_id, p_security_review_status, p_pin_verified_at, p_min_kyc_level
  );

  v_withdrawal_id := NULLIF(v_result->>'withdrawal_id', '')::bigint;
  IF v_withdrawal_id IS NULL THEN RAISE EXCEPTION 'Withdrawal request ID is missing.'; END IF;

  UPDATE public.withdrawal_requests
  SET tax_country_code = v_quote->>'country_code',
      tax_payout_method = v_quote->>'payout_method',
      tax_rate_percent = (v_quote->>'rate_percent')::numeric,
      tax_fixed_amount = (v_quote->>'fixed_amount')::numeric,
      tax_amount = (v_quote->>'tax_amount')::numeric,
      tax_rule_id = (v_quote->>'rule_id')::bigint,
      tax_source_reference = v_quote->>'source_reference',
      net_amount = GREATEST(
        COALESCE(amount, 0) - COALESCE(fee_amount, 0) - (v_quote->>'tax_amount')::numeric,
        0
      ),
      updated_at = now()
  WHERE id = v_withdrawal_id AND user_id = p_user_id;

  UPDATE public.wallet_transactions
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'withdrawal_tax_country_code', v_quote->>'country_code',
        'withdrawal_tax_payout_method', v_quote->>'payout_method',
        'withdrawal_tax_rate_percent', (v_quote->>'rate_percent')::numeric,
        'withdrawal_tax_amount', (v_quote->>'tax_amount')::numeric,
        'withdrawal_net_amount', (v_quote->>'net_amount')::numeric
      ),
      updated_at = now()
  WHERE metadata->>'withdrawal_id' = v_withdrawal_id::text
    AND COALESCE(type, transaction_type) = 'withdraw_request';

  RETURN v_result || v_quote || jsonb_build_object(
    'withdrawal_id', v_withdrawal_id,
    'tax_bearer', 'seller'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_admin_process_withdrawal_v22(
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
SET search_path = public
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
  v_fee numeric;
  v_tax numeric;
  v_net numeric;
  v_existing_refund bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND lower(COALESCE(role, '')) = 'admin'
  ) THEN RAISE EXCEPTION 'Admin access required.'; END IF;

  v_action := lower(trim(COALESCE(p_action, '')));
  v_note := NULLIF(trim(COALESCE(p_note, '')), '');
  v_reference := NULLIF(trim(COALESCE(p_reference, '')), '');
  v_provider := NULLIF(trim(COALESCE(p_provider, '')), '');
  v_fee := GREATEST(round(COALESCE(p_fee_amount, 0), 2), 0);

  IF v_action NOT IN ('approve', 'processing', 'paid', 'reject', 'fail') THEN
    RAISE EXCEPTION 'Unsupported withdrawal action.';
  END IF;
  IF v_action IN ('reject', 'fail') AND v_note IS NULL THEN
    RAISE EXCEPTION 'An admin note is required for rejected or failed payouts.';
  END IF;
  IF v_action = 'paid' AND v_reference IS NULL THEN
    RAISE EXCEPTION 'A payout reference is required before marking a withdrawal paid.';
  END IF;

  SELECT * INTO v_request
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found.'; END IF;

  v_status := lower(COALESCE(v_request.status, 'pending'));
  IF v_status IN ('paid', 'rejected', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'already_processed', true,
      'withdrawal_id', v_request.id,
      'status', v_request.status,
      'tax_amount', COALESCE(v_request.tax_amount, 0),
      'net_amount', COALESCE(v_request.net_amount, 0)
    );
  END IF;

  IF v_action = 'approve' AND v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending withdrawals can be approved.';
  END IF;
  IF v_action = 'processing' AND v_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Only pending or approved withdrawals can enter processing.';
  END IF;
  IF v_action = 'paid' AND v_status NOT IN ('approved', 'processing') THEN
    RAISE EXCEPTION 'Only approved or processing withdrawals can be marked paid.';
  END IF;
  IF v_action IN ('approve', 'processing', 'paid')
     AND COALESCE(v_request.eligible_at, now()) > now()
     AND NOT COALESCE(p_override_hold, false) THEN
    RAISE EXCEPTION 'Withdrawal hold period has not finished.';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = v_request.wallet_id AND user_id = v_request.user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found for this withdrawal.'; END IF;

  v_before := COALESCE(v_wallet.balance, 0);
  v_after := v_before;
  v_tax := LEAST(COALESCE(v_request.tax_amount, 0), COALESCE(v_request.amount, 0));
  v_fee := LEAST(v_fee, GREATEST(COALESCE(v_request.amount, 0) - v_tax, 0));
  v_net := round(GREATEST(COALESCE(v_request.amount, 0) - v_tax - v_fee, 0), 2);

  IF v_action = 'approve' THEN
    UPDATE public.withdrawal_requests
    SET status = 'approved', admin_note = COALESCE(v_note, admin_note),
        fee_amount = v_fee, net_amount = v_net,
        payout_provider = COALESCE(v_provider, payout_provider),
        provider_status = 'approved', approved_at = COALESCE(approved_at, now()),
        updated_at = now()
    WHERE id = v_request.id;

  ELSIF v_action = 'processing' THEN
    UPDATE public.withdrawal_requests
    SET status = 'processing', admin_note = COALESCE(v_note, admin_note),
        fee_amount = v_fee, net_amount = v_net,
        payout_provider = COALESCE(v_provider, payout_provider),
        provider_status = 'processing', approved_at = COALESCE(approved_at, now()),
        processing_at = COALESCE(processing_at, now()), updated_at = now()
    WHERE id = v_request.id;

  ELSIF v_action = 'paid' THEN
    UPDATE public.withdrawal_requests
    SET status = 'paid', admin_note = COALESCE(v_note, admin_note),
        fee_amount = v_fee, net_amount = v_net,
        payout_reference = v_reference,
        payout_provider = COALESCE(v_provider, payout_provider),
        provider_status = 'settled', approved_at = COALESCE(approved_at, now()),
        processing_at = COALESCE(processing_at, now()), paid_at = now(),
        processed_at = now(), updated_at = now()
    WHERE id = v_request.id;

    UPDATE public.wallets
    SET total_withdrawn = COALESCE(total_withdrawn, 0) + COALESCE(v_request.amount, 0),
        updated_at = now()
    WHERE id = v_wallet.id;

    UPDATE public.wallet_transactions
    SET type = 'withdraw_paid', transaction_type = 'withdraw_paid', status = 'completed',
        description = 'Withdrawal paid after country/method tax. Reference: ' || v_reference,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'withdrawal_id', v_request.id,
          'admin_id', p_admin_id,
          'payout_reference', v_reference,
          'payout_provider', v_provider,
          'fee_amount', v_fee,
          'withdrawal_tax_amount', v_tax,
          'withdrawal_tax_rate_percent', COALESCE(v_request.tax_rate_percent, 0),
          'net_amount', v_net
        ),
        updated_at = now()
    WHERE metadata->>'withdrawal_id' = v_request.id::text
      AND COALESCE(type, transaction_type) IN ('withdraw_request', 'withdraw_approved');

    INSERT INTO public.seller_tax_ledger (
      seller_id, tax_type, source_type, source_id, taxable_amount,
      rate_percent, fixed_amount, tax_amount, currency, status,
      country_code, payout_method, metadata, recognized_at, updated_at
    ) VALUES (
      v_request.user_id, 'withdrawal_tax', 'withdrawal', v_request.id::text,
      COALESCE(v_request.amount, 0), COALESCE(v_request.tax_rate_percent, 0),
      COALESCE(v_request.tax_fixed_amount, 0), v_tax,
      COALESCE(v_request.currency, 'IDR'), 'withheld',
      v_request.tax_country_code, v_request.tax_payout_method,
      jsonb_build_object('provider_fee', v_fee, 'net_amount', v_net, 'reference', v_reference),
      now(), now()
    )
    ON CONFLICT (tax_type, source_type, source_id) DO UPDATE SET
      taxable_amount = EXCLUDED.taxable_amount,
      rate_percent = EXCLUDED.rate_percent,
      fixed_amount = EXCLUDED.fixed_amount,
      tax_amount = EXCLUDED.tax_amount,
      status = EXCLUDED.status,
      country_code = EXCLUDED.country_code,
      payout_method = EXCLUDED.payout_method,
      metadata = EXCLUDED.metadata,
      recognized_at = EXCLUDED.recognized_at,
      updated_at = now();

  ELSE
    SELECT id INTO v_existing_refund
    FROM public.wallet_transactions
    WHERE metadata->>'withdrawal_id' = v_request.id::text
      AND COALESCE(type, transaction_type) IN (
        'withdraw_rejected_refund', 'withdraw_failed_refund', 'withdraw_cancelled_refund'
      )
    LIMIT 1;

    IF v_existing_refund IS NULL THEN
      v_after := v_before + COALESCE(v_request.amount, 0);
      UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;

      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, transaction_type, amount,
        balance_before, balance_after, status, description, metadata, created_at, updated_at
      ) VALUES (
        v_wallet.id, v_request.user_id,
        CASE WHEN v_action = 'reject' THEN 'withdraw_rejected_refund' ELSE 'withdraw_failed_refund' END,
        CASE WHEN v_action = 'reject' THEN 'withdraw_rejected_refund' ELSE 'withdraw_failed_refund' END,
        COALESCE(v_request.amount, 0), v_before, v_after, 'completed',
        CASE WHEN v_action = 'reject'
          THEN 'Withdrawal rejected; gross amount including reserved tax was returned. '
          ELSE 'Withdrawal failed; gross amount including reserved tax was returned. '
        END || COALESCE(v_note, ''),
        jsonb_build_object('withdrawal_id', v_request.id, 'admin_id', p_admin_id),
        now(), now()
      );
    END IF;

    UPDATE public.withdrawal_requests
    SET status = CASE WHEN v_action = 'reject' THEN 'rejected' ELSE 'failed' END,
        admin_note = v_note,
        payout_reference = COALESCE(v_reference, payout_reference),
        payout_provider = COALESCE(v_provider, payout_provider),
        provider_status = CASE WHEN v_action = 'reject' THEN 'rejected' ELSE 'failed' END,
        failed_at = CASE WHEN v_action = 'fail' THEN now() ELSE failed_at END,
        processed_at = now(), updated_at = now()
    WHERE id = v_request.id;

    UPDATE public.wallet_transactions
    SET status = 'rejected', description = COALESCE(v_note, description),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('admin_id', p_admin_id),
        updated_at = now()
    WHERE metadata->>'withdrawal_id' = v_request.id::text
      AND COALESCE(type, transaction_type) IN ('withdraw_request', 'withdraw_approved');
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
  VALUES (
    v_request.user_id, 'withdrawal',
    CASE v_action
      WHEN 'approve' THEN 'Withdrawal Approved'
      WHEN 'processing' THEN 'Withdrawal Processing'
      WHEN 'paid' THEN 'Withdrawal Paid'
      WHEN 'reject' THEN 'Withdrawal Rejected'
      ELSE 'Withdrawal Failed'
    END,
    CASE v_action
      WHEN 'approve' THEN 'Withdrawal request #' || v_request.id || ' was approved.'
      WHEN 'processing' THEN 'Withdrawal request #' || v_request.id || ' is being processed.'
      WHEN 'paid' THEN 'Withdrawal request #' || v_request.id || ' was paid net of tax. Reference: ' || v_reference
      WHEN 'reject' THEN 'Withdrawal request #' || v_request.id || ' was rejected and the full reserved balance was returned.'
      ELSE 'Withdrawal request #' || v_request.id || ' failed and the full reserved balance was returned.'
    END,
    '/seller/payouts', false
  );

  RETURN jsonb_build_object(
    'already_processed', false,
    'withdrawal_id', v_request.id,
    'action', v_action,
    'balance_before', v_before,
    'balance_after', v_after,
    'fee_amount', v_fee,
    'tax_amount', v_tax,
    'tax_rate_percent', COALESCE(v_request.tax_rate_percent, 0),
    'net_amount', v_net
  );
END;
$$;

-- Recalculate only unpaid orders. Paid orders remain immutable and auditable under
-- the tax model that applied when payment occurred.
DO $$
DECLARE v_row record;
BEGIN
  FOR v_row IN
    SELECT id, buyer_id
    FROM public.orders
    WHERE lower(COALESCE(payment_status, 'unpaid')) <> 'paid'
      AND buyer_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.cp_apply_seller_tax_v22(v_row.id, v_row.buyer_id, 0.05);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped unpaid order % during V22 recalculation: %', v_row.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER TABLE public.seller_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_sales_tax_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_tax_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_tax_settings_read_active ON public.seller_tax_settings;
CREATE POLICY seller_tax_settings_read_active ON public.seller_tax_settings
  FOR SELECT TO authenticated USING (lower(status) = 'active');

DROP POLICY IF EXISTS withdrawal_tax_rates_read_active ON public.withdrawal_tax_rates;
CREATE POLICY withdrawal_tax_rates_read_active ON public.withdrawal_tax_rates
  FOR SELECT TO authenticated USING (
    lower(status) = 'active'
    AND valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  );

REVOKE INSERT, UPDATE, DELETE ON public.seller_tax_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.seller_sales_tax_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawal_tax_rates FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.seller_tax_ledger FROM anon, authenticated;

GRANT SELECT ON public.seller_tax_settings TO authenticated;
GRANT SELECT ON public.withdrawal_tax_rates TO authenticated;

REVOKE ALL ON FUNCTION public.cp_apply_seller_tax_v22(bigint, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_order_and_release_escrow_v22(bigint, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_quote_withdrawal_tax_v22(uuid, bigint, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_create_withdrawal_request_v22(uuid, bigint, numeric, text, uuid, integer, integer, text, jsonb, uuid, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_admin_process_withdrawal_v22(bigint, uuid, text, text, text, text, numeric, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cp_apply_seller_tax_v22(bigint, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_and_release_escrow_v22(bigint, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_quote_withdrawal_tax_v22(uuid, bigint, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_create_withdrawal_request_v22(uuid, bigint, numeric, text, uuid, integer, integer, text, jsonb, uuid, text, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_admin_process_withdrawal_v22(bigint, uuid, text, text, text, text, numeric, boolean) TO service_role;

ALTER TABLE public.launch_signoffs
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.launch_signoffs
SET label = 'Seller-borne 5% sales tax verified; buyer tax disabled',
    status = 'pending',
    note = NULL,
    signed_at = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"introduced_in":"v22","tax_bearer":"seller"}'::jsonb,
    updated_at = now()
WHERE area = 'tax_configuration';

INSERT INTO public.launch_signoffs(area, label, status, note, metadata)
VALUES (
  'withdrawal_tax_configuration',
  'Country and payout-method withdrawal tax rules verified',
  'pending', NULL,
  '{"introduced_in":"v22"}'::jsonb
)
ON CONFLICT (area) DO UPDATE SET
  label = EXCLUDED.label,
  status = 'pending',
  note = NULL,
  signed_at = NULL,
  metadata = COALESCE(public.launch_signoffs.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

COMMIT;

SELECT 'comeplayers_seller_tax_withholding_v22_ready' AS status;
