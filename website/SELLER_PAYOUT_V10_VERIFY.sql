-- ComePlayers Seller Payout Center V10 verification
SELECT 'payout_accounts' AS object_name, count(*) AS rows FROM public.payout_accounts
UNION ALL
SELECT 'withdrawal_requests', count(*) FROM public.withdrawal_requests;

SELECT
  id, user_id, method, label, account_name, account_last4,
  is_default, status, verification_status, created_at
FROM public.payout_accounts
ORDER BY id DESC
LIMIT 20;

SELECT
  id, user_id, wallet_id, payout_account_id, amount, fee_amount, net_amount,
  currency, payout_method, payout_account_number, status, provider_status,
  eligible_at, payout_reference, created_at, processed_at
FROM public.withdrawal_requests
ORDER BY id DESC
LIMIT 20;

SELECT
  id, user_id, type, transaction_type, amount, status, description, metadata, created_at
FROM public.wallet_transactions
WHERE COALESCE(type, transaction_type) LIKE 'withdraw%'
ORDER BY id DESC
LIMIT 50;
