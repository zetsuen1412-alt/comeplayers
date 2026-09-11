-- ComePlayers V23.6 - wallet transaction type compatibility.
-- Run after V23.5. Existing installations may still have the legacy wallet
-- transaction type check from the pre-escrow wallet schema.

BEGIN;

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (
    type IS NULL OR type IN (
      'deposit',
      'purchase',
      'sale_pending',
      'sale_release',
      'withdraw_request',
      'withdraw_approved',
      'withdraw_rejected',
      'refund',
      'adjustment',
      'buyer_order_payment',
      'seller_order_payout',
      'topup_rejected',
      'withdraw_rejected_refund',
      'withdraw_failed_refund',
      'withdraw_cancelled_refund',
      'withdraw_paid',
      'order_refund'
    )
  );

COMMIT;

SELECT 'comeplayers_wallet_transaction_types_v23_6_ready' AS status;
