-- One database snapshot prevents row-limit truncation and partial zero metrics.
-- Invoker security and service-role-only execution; the API verifies admin access.
CREATE OR REPLACE FUNCTION public.cp_admin_workspace_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'snapshotAt',now(),'ledgerCurrency','IDR',
  'metrics',jsonb_build_object(
   'users',(SELECT count(*) FROM profiles),
   'products',(SELECT count(*) FROM products WHERE status IS DISTINCT FROM 'deleted'),
   'orders',(SELECT count(*) FROM orders),
   'completedOrders',(SELECT count(*) FROM orders WHERE status='completed' AND payment_status='paid'),
   'paidOrders',(SELECT count(*) FROM orders WHERE payment_status='paid' AND status NOT IN ('completed','cancelled','expired','refunded')),
   'grossVolume',(SELECT coalesce(sum(coalesce(nullif(total_amount,0),total_price,0)),0) FROM orders WHERE status='completed' AND payment_status='paid' AND coalesce(currency_code,'IDR')='IDR'),
   'feeRevenue',(SELECT coalesce(sum(marketplace_fee_amount),0) FROM orders WHERE status='completed' AND payment_status='paid' AND coalesce(currency_code,'IDR')='IDR'),
   'pendingSellerApplications',(SELECT count(*) FROM seller_applications WHERE status='pending'),
   'activeDisputes',(SELECT count(*) FROM disputes WHERE status IN ('open','investigating')),
   'pendingWithdrawals',(SELECT count(*) FROM withdrawal_requests WHERE status='pending'),
   'supportQueue',(SELECT count(*) FROM support_tickets WHERE status IN ('open','waiting_admin')),
   'walletBalance',(SELECT coalesce(sum(balance),0) FROM wallets),
   'walletCount',(SELECT count(*) FROM wallets),
   'topupsForReview',(SELECT count(*) FROM cp_wallet_topup_intents WHERE status='review'),
   'manualTopupsPending',(SELECT count(*) FROM wallet_topups WHERE status='pending' AND payment_intent_id IS NULL)
  ),
  'recentOrders',(SELECT coalesce(jsonb_agg(to_jsonb(recent) ORDER BY recent.created_at DESC,recent.id DESC),'[]'::jsonb) FROM (
   SELECT id,product_title,product,total_amount,total_price,status,payment_status,created_at FROM orders ORDER BY created_at DESC,id DESC LIMIT 8
  ) recent)
 );
$$;
REVOKE ALL ON FUNCTION public.cp_admin_workspace_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cp_admin_workspace_overview() TO service_role;
NOTIFY pgrst,'reload schema';
