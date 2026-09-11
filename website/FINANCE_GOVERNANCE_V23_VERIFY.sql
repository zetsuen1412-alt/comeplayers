-- ComePlayers V23 finance-governance verification. Read-only.

SELECT
  to_regclass('public.marketplace_fee_settings') AS marketplace_fee_settings,
  to_regclass('public.seller_sales_tax_rates') AS seller_sales_tax_rates,
  to_regclass('public.rate_change_requests') AS rate_change_requests,
  to_regclass('public.order_pricing_snapshots') AS order_pricing_snapshots,
  to_regclass('public.seller_tax_residencies') AS seller_tax_residencies,
  to_regclass('public.fx_rates') AS fx_rates,
  to_regclass('public.fx_snapshots') AS fx_snapshots,
  to_regclass('public.accounting_periods') AS accounting_periods,
  to_regclass('public.seller_tax_statements') AS seller_tax_statements,
  to_regclass('public.seller_tax_statement_lines') AS seller_tax_statement_lines,
  to_regclass('public.payout_execution_attempts') AS payout_execution_attempts;

SELECT
  to_regprocedure('public.cp_apply_seller_tax_v23(bigint,uuid)') AS apply_pricing_snapshot,
  to_regprocedure('public.complete_order_and_release_escrow_v23(bigint,uuid)') AS release_escrow,
  to_regprocedure('public.cp_quote_withdrawal_v23(uuid,bigint,numeric)') AS quote_withdrawal,
  to_regprocedure('public.cp_approve_rate_change_v23(uuid,uuid,text,text)') AS approve_rate_change,
  to_regprocedure('public.cp_generate_seller_tax_statement_v23(uuid,timestamptz,timestamptz,text,uuid,boolean)') AS generate_statement,
  to_regprocedure('public.cp_close_accounting_period_v23(uuid,uuid)') AS close_period;

SELECT setting_key, rate_percent, status, valid_from, valid_to, source_reference
FROM public.marketplace_fee_settings
ORDER BY valid_from DESC;

SELECT setting_key, rate_percent, status, valid_from, valid_to, source_reference
FROM public.seller_sales_tax_rates
ORDER BY valid_from DESC;

SELECT area, label, status
FROM public.launch_signoffs
WHERE area IN (
  'immutable_pricing',
  'rate_dual_approval',
  'tax_residency',
  'accounting_close',
  'provider_payout_execution'
)
ORDER BY area;

SELECT
  count(*) FILTER (WHERE lower(COALESCE(o.payment_status,'unpaid')) <> 'paid') AS unpaid_orders,
  count(*) FILTER (
    WHERE lower(COALESCE(o.payment_status,'unpaid')) <> 'paid'
      AND s.order_id IS NULL
  ) AS unpaid_orders_without_v23_snapshot
FROM public.orders o
LEFT JOIN public.order_pricing_snapshots s ON s.order_id = o.id;

SELECT
  count(*) FILTER (WHERE status IN ('pending','partially_approved')) AS open_rate_requests,
  count(*) FILTER (WHERE status = 'applied') AS applied_rate_requests
FROM public.rate_change_requests;

SELECT status, count(*)
FROM public.seller_tax_residencies
GROUP BY status
ORDER BY status;

SELECT period_key, status, period_start, period_end, closed_at
FROM public.accounting_periods
ORDER BY period_start DESC
LIMIT 24;

SELECT 'comeplayers_finance_governance_v23_verified' AS status;
