-- ComePlayers Security Boundary V4
-- Run after Foundation V3 / Transaction Core V2.1.
-- Moves sensitive admin and financial mutations behind server APIs and
-- provides atomic wallet top-up / withdrawal processing functions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id bigserial PRIMARY KEY,
  admin_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id
  ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
  ON public.admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_audit_logs_admin_id_fkey'
      AND conrelid = 'public.admin_audit_logs'::regclass
  ) THEN
    ALTER TABLE public.admin_audit_logs
      ADD CONSTRAINT admin_audit_logs_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- No browser-facing policies are intentionally created. Service-role API
-- routes can write audit logs while authenticated browser clients cannot.

CREATE OR REPLACE FUNCTION public.cp_admin_process_wallet_topup(
  p_topup_id bigint,
  p_admin_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topup public.wallet_topups%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_action text;
  v_note text;
  v_amount numeric;
  v_before numeric;
  v_after numeric;
  v_existing_tx bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND lower(COALESCE(role, '')) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_action := lower(trim(COALESCE(p_action, '')));
  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  IF v_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unsupported wallet top-up action.';
  END IF;

  IF v_action = 'reject' AND v_note IS NULL THEN
    RAISE EXCEPTION 'An admin note is required when rejecting a top-up.';
  END IF;

  SELECT * INTO v_topup
  FROM public.wallet_topups
  WHERE id = p_topup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up not found.';
  END IF;

  IF lower(COALESCE(v_topup.status, '')) <> 'pending' THEN
    RETURN jsonb_build_object(
      'already_processed', true,
      'status', v_topup.status,
      'topup_id', v_topup.id
    );
  END IF;

  v_amount := COALESCE(v_topup.amount, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Wallet top-up amount is invalid.';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = v_topup.wallet_id AND user_id = v_topup.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for this top-up.';
  END IF;

  v_before := COALESCE(v_wallet.balance, 0);

  IF v_action = 'approve' THEN
    v_after := v_before + v_amount;

    UPDATE public.wallets
    SET balance = v_after, updated_at = now()
    WHERE id = v_wallet.id;

    UPDATE public.wallet_topups
    SET
      status = 'approved',
      admin_note = COALESCE(v_note, 'Wallet top-up approved by admin.'),
      processed_at = now()
    WHERE id = v_topup.id;

    SELECT id INTO v_existing_tx
    FROM public.wallet_transactions
    WHERE metadata->>'topup_id' = v_topup.id::text
      AND COALESCE(type, transaction_type) = 'deposit'
    LIMIT 1;

    IF v_existing_tx IS NULL THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, transaction_type, amount,
        balance_before, balance_after, status, description, metadata
      ) VALUES (
        v_wallet.id, v_topup.user_id, 'deposit', 'deposit', v_amount,
        v_before, v_after, 'completed',
        'Wallet top-up approved by admin.',
        jsonb_build_object('topup_id', v_topup.id, 'admin_id', p_admin_id)
      );
    END IF;

    INSERT INTO public.notifications (
      user_id, type, title, message, link_url, is_read
    ) VALUES (
      v_topup.user_id,
      'payment',
      'Wallet Top Up Approved',
      'Your wallet top-up of Rp ' || trim(to_char(v_amount, 'FM999G999G999G999G990')) || ' has been approved.',
      '/wallet',
      false
    );
  ELSE
    v_after := v_before;

    UPDATE public.wallet_topups
    SET
      status = 'rejected',
      admin_note = v_note,
      processed_at = now()
    WHERE id = v_topup.id;

    SELECT id INTO v_existing_tx
    FROM public.wallet_transactions
    WHERE metadata->>'topup_id' = v_topup.id::text
      AND COALESCE(type, transaction_type) = 'topup_rejected'
    LIMIT 1;

    IF v_existing_tx IS NULL THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, transaction_type, amount,
        balance_before, balance_after, status, description, metadata
      ) VALUES (
        v_wallet.id, v_topup.user_id, 'topup_rejected', 'topup_rejected', v_amount,
        v_before, v_after, 'rejected',
        'Wallet top-up rejected. ' || v_note,
        jsonb_build_object('topup_id', v_topup.id, 'admin_id', p_admin_id)
      );
    END IF;

    INSERT INTO public.notifications (
      user_id, type, title, message, link_url, is_read
    ) VALUES (
      v_topup.user_id,
      'payment',
      'Wallet Top Up Rejected',
      'Your wallet top-up request was rejected. Reason: ' || v_note,
      '/wallet/topup',
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'already_processed', false,
    'action', v_action,
    'topup_id', v_topup.id,
    'wallet_id', v_wallet.id,
    'balance_before', v_before,
    'balance_after', v_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_admin_process_withdrawal(
  p_withdrawal_id bigint,
  p_admin_id uuid,
  p_action text,
  p_note text DEFAULT NULL
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
  v_amount numeric;
  v_before numeric;
  v_after numeric;
  v_existing_tx bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND lower(COALESCE(role, '')) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_action := lower(trim(COALESCE(p_action, '')));
  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  IF v_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unsupported withdrawal action.';
  END IF;

  IF v_action = 'reject' AND v_note IS NULL THEN
    RAISE EXCEPTION 'An admin note is required when rejecting a withdrawal.';
  END IF;

  SELECT * INTO v_request
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found.';
  END IF;

  IF lower(COALESCE(v_request.status, '')) <> 'pending' THEN
    RETURN jsonb_build_object(
      'already_processed', true,
      'status', v_request.status,
      'withdrawal_id', v_request.id
    );
  END IF;

  v_amount := COALESCE(v_request.amount, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount is invalid.';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = v_request.wallet_id AND user_id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for this withdrawal.';
  END IF;

  v_before := COALESCE(v_wallet.balance, 0);
  v_after := v_before;

  IF v_action = 'approve' THEN
    UPDATE public.withdrawal_requests
    SET
      status = 'approved',
      admin_note = COALESCE(v_note, 'Withdrawal approved by admin.'),
      processed_at = now()
    WHERE id = v_request.id;

    UPDATE public.wallet_transactions
    SET
      type = 'withdraw_approved',
      transaction_type = 'withdraw_approved',
      status = 'completed',
      description = COALESCE(v_note, 'Withdrawal approved by admin.'),
      metadata = COALESCE(metadata, '{}'::jsonb) ||
        jsonb_build_object('withdrawal_id', v_request.id, 'admin_id', p_admin_id)
    WHERE wallet_id = v_request.wallet_id
      AND user_id = v_request.user_id
      AND COALESCE(type, transaction_type) = 'withdraw_request'
      AND amount = v_amount
      AND status = 'pending';

    INSERT INTO public.notifications (
      user_id, type, title, message, link_url, is_read
    ) VALUES (
      v_request.user_id,
      'withdrawal',
      'Withdrawal Approved',
      'Your withdrawal request has been approved.',
      '/wallet',
      false
    );
  ELSE
    v_after := v_before + v_amount;

    UPDATE public.wallets
    SET balance = v_after, updated_at = now()
    WHERE id = v_wallet.id;

    UPDATE public.withdrawal_requests
    SET
      status = 'rejected',
      admin_note = v_note,
      processed_at = now()
    WHERE id = v_request.id;

    UPDATE public.wallet_transactions
    SET
      status = 'rejected',
      description = 'Withdrawal request rejected. ' || v_note,
      metadata = COALESCE(metadata, '{}'::jsonb) ||
        jsonb_build_object('withdrawal_id', v_request.id, 'admin_id', p_admin_id)
    WHERE wallet_id = v_request.wallet_id
      AND user_id = v_request.user_id
      AND COALESCE(type, transaction_type) = 'withdraw_request'
      AND amount = v_amount
      AND status = 'pending';

    SELECT id INTO v_existing_tx
    FROM public.wallet_transactions
    WHERE metadata->>'withdrawal_id' = v_request.id::text
      AND COALESCE(type, transaction_type) = 'withdraw_rejected_refund'
    LIMIT 1;

    IF v_existing_tx IS NULL THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, transaction_type, amount,
        balance_before, balance_after, status, description, metadata
      ) VALUES (
        v_wallet.id, v_request.user_id,
        'withdraw_rejected_refund', 'withdraw_rejected_refund', v_amount,
        v_before, v_after, 'completed',
        'Withdrawal rejected and wallet balance refunded. ' || v_note,
        jsonb_build_object('withdrawal_id', v_request.id, 'admin_id', p_admin_id)
      );
    END IF;

    INSERT INTO public.notifications (
      user_id, type, title, message, link_url, is_read
    ) VALUES (
      v_request.user_id,
      'withdrawal',
      'Withdrawal Rejected',
      'Your withdrawal request was rejected and the amount was returned to your wallet. Reason: ' || v_note,
      '/wallet',
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'already_processed', false,
    'action', v_action,
    'withdrawal_id', v_request.id,
    'wallet_id', v_wallet.id,
    'balance_before', v_before,
    'balance_after', v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cp_admin_process_wallet_topup(bigint, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_admin_process_withdrawal(bigint, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_admin_process_wallet_topup(bigint, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_admin_process_withdrawal(bigint, uuid, text, text)
  TO service_role;

COMMIT;

SELECT
  'comeplayers_security_boundary_v4_ready' AS status,
  (SELECT count(*) FROM public.admin_audit_logs) AS audit_log_count;
