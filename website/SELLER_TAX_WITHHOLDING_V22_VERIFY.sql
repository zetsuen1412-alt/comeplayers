-- ComePlayers V22 verification
-- Run after scripts/comeplayers_seller_tax_withholding_v22.sql.

SELECT
  to_regclass('public.seller_tax_settings') AS seller_tax_settings,
  to_regclass('public.seller_sales_tax_snapshots') AS seller_sales_tax_snapshots,
  to_regclass('public.withdrawal_tax_rates') AS withdrawal_tax_rates,
  to_regclass('public.seller_tax_ledger') AS seller_tax_ledger;

SELECT
  to_regprocedure('public.cp_apply_seller_tax_v22(bigint,uuid,numeric)') AS apply_seller_tax,
  to_regprocedure('public.complete_order_and_release_escrow_v22(bigint,uuid,numeric)') AS release_escrow,
  to_regprocedure('public.cp_quote_withdrawal_tax_v22(uuid,bigint,numeric)') AS quote_withdrawal_tax,
  to_regprocedure('public.cp_create_withdrawal_request_v22(uuid,bigint,numeric,text,uuid,integer,integer,text,jsonb,uuid,text,timestamptz,integer)') AS create_withdrawal,
  to_regprocedure('public.cp_admin_process_withdrawal_v22(bigint,uuid,text,text,text,text,numeric,boolean)') AS process_withdrawal;

-- Expected: global_seller_sales_tax | 5 | active
SELECT setting_key, sales_tax_rate_percent, status, source_reference
FROM public.seller_tax_settings
WHERE setting_key = 'global_seller_sales_tax';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN (
    'seller_gross_amount',
    'seller_sales_tax_rate_percent',
    'seller_sales_tax_amount'
  )
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'withdrawal_requests'
  AND column_name IN (
    'tax_country_code',
    'tax_payout_method',
    'tax_rate_percent',
    'tax_fixed_amount',
    'tax_amount',
    'tax_rule_id',
    'tax_source_reference'
  )
ORDER BY column_name;

-- Expected active_buyer_tax_rules = 0. Historical rows remain for audit.
SELECT count(*) AS active_buyer_tax_rules
FROM public.tax_rates
WHERE lower(COALESCE(status, '')) = 'active';

-- Expected unpaid_orders_missing_v22_snapshot = 0, except orders that the migration
-- explicitly reported as skipped because their older data was invalid.
SELECT count(*) AS unpaid_orders_missing_v22_snapshot
FROM public.orders o
WHERE lower(COALESCE(o.payment_status, 'unpaid')) <> 'paid'
  AND o.buyer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.seller_sales_tax_snapshots s WHERE s.order_id = o.id
  );

-- Paid historical orders without a V22 snapshot must show zero V22 seller tax.
SELECT count(*) AS legacy_paid_orders_with_incorrect_v22_rate
FROM public.orders o
WHERE lower(COALESCE(o.payment_status, 'unpaid')) = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.seller_sales_tax_snapshots s WHERE s.order_id = o.id
  )
  AND (
    COALESCE(o.seller_sales_tax_rate_percent, 0) <> 0
    OR COALESCE(o.seller_sales_tax_amount, 0) <> 0
  );

SELECT area, label, status
FROM public.launch_signoffs
WHERE area IN ('tax_configuration', 'withdrawal_tax_configuration')
ORDER BY area;

-- Active withdrawal tax rules must be configured manually for every supported
-- country + payout method + currency before seller withdrawals can be requested.
SELECT country_code, payout_method, currency, rate_percent, fixed_amount, status,
       source_reference, valid_from, valid_to
FROM public.withdrawal_tax_rates
ORDER BY country_code, payout_method, currency, valid_from DESC;

-- Current exact active combinations. Empty is valid immediately after migration,
-- but seller withdrawals will remain intentionally blocked.
SELECT country_code, payout_method, currency, rate_percent, fixed_amount,
       source_reference, valid_from, valid_to
FROM public.withdrawal_tax_rates
WHERE lower(status) = 'active'
  AND valid_from <= now()
  AND (valid_to IS NULL OR valid_to > now())
ORDER BY country_code, payout_method, currency;
