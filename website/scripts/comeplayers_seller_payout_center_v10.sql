-- ComePlayers Seller Payout Center V10
-- Adds encrypted payout accounts, seller withdrawal requests, cancellation,
-- reconciliation fields, and a multi-stage admin payout workflow.
-- Additive and idempotent. Run in Supabase SQL Editor after V9.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.payout_accounts (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  method text NOT NULL,
  label text,
  account_name text NOT NULL,
  account_last4 text,
  bank_name text,
  country_code text DEFAULT 'ID',
  currency text DEFAULT 'IDR',
  ciphertext text,
  iv text,
  auth_tag text,
  key_version integer DEFAULT 1,
  is_default boolean DEFAULT false,
  status text DEFAULT 'active',
  verification_status text DEFAULT 'unverified',
  verified_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.payout_accounts
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_last4 text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'ID',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS ciphertext text,
  ADD COLUMN IF NOT EXISTS iv text,
  ADD COLUMN IF NOT EXISTS auth_tag text,
  ADD COLUMN IF NOT EXISTS key_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS payout_accounts_user_idx
  ON public.payout_accounts(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_one_default_idx
  ON public.payout_accounts(user_id)
  WHERE is_default = true AND lower(COALESCE(status, 'active')) = 'active';

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  wallet_id bigint NOT NULL,
  payout_account_id bigint,
  amount numeric NOT NULL,
  fee_amount numeric DEFAULT 0,
  net_amount numeric DEFAULT 0,
  currency text DEFAULT 'IDR',
  payout_method text,
  payout_account_name text,
  payout_account_number text,
  payout_ciphertext text,
  payout_iv text,
  payout_auth_tag text,
  payout_key_version integer DEFAULT 1,
  payout_note text,
  status text DEFAULT 'pending',
  admin_note text,
  payout_reference text,
  payout_provider text,
  provider_status text,
  request_key uuid,
  eligible_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  processing_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS wallet_id bigint,
  ADD COLUMN IF NOT EXISTS payout_account_id bigint,
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS payout_method text,
  ADD COLUMN IF NOT EXISTS payout_account_name text,
  ADD COLUMN IF NOT EXISTS payout_account_number text,
  ADD COLUMN IF NOT EXISTS payout_ciphertext text,
  ADD COLUMN IF NOT EXISTS payout_iv text,
  ADD COLUMN IF NOT EXISTS payout_auth_tag text,
  ADD COLUMN IF NOT EXISTS payout_key_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payout_note text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS payout_reference text,
  ADD COLUMN IF NOT EXISTS payout_provider text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS request_key uuid,
  ADD COLUMN IF NOT EXISTS eligible_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.withdrawal_requests
SET
  net_amount = CASE
    WHEN COALESCE(net_amount, 0) <= 0 THEN GREATEST(COALESCE(amount, 0) - COALESCE(fee_amount, 0), 0)
    ELSE net_amount
  END,
  currency = COALESCE(NULLIF(currency, ''), 'IDR'),
  eligible_at = COALESCE(eligible_at, created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx
  ON public.withdrawal_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx
  ON public.withdrawal_requests(status, eligible_at, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_request_key_idx
  ON public.withdrawal_requests(request_key)
  WHERE request_key IS NOT NULL;

-- Older installations may have a restrictive status check that only knows
-- pending/approved/rejected/cancelled. Replace status checks with the V10 flow.
DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.withdrawal_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_v10_check
  CHECK (lower(COALESCE(status, 'pending')) IN (
    'pending', 'approved', 'processing', 'paid',
    'rejected', 'failed', 'cancelled'
  )) NOT VALID;

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS total_withdrawn numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.cp_create_withdrawal_request_v10(
  p_user_id uuid,
  p_payout_account_id bigint,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_request_key uuid DEFAULT gen_random_uuid(),
  p_hold_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_account public.payout_accounts%ROWTYPE;
  v_existing public.withdrawal_requests%ROWTYPE;
  v_request public.withdrawal_requests%ROWTYPE;
  v_amount numeric;
  v_before numeric;
  v_after numeric;
  v_hold_hours integer;
  v_last4 text;
BEGIN
  SELECT * INTO v_existing
  FROM public.withdrawal_requests
  WHERE request_key = p_request_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'already_created', true,
      'withdrawal_id', v_existing.id,
      'status', v_existing.status,
      'eligible_at', v_existing.eligible_at
    );
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND OR NOT (
    lower(COALESCE(v_profile.role, '')) IN ('seller', 'admin')
    OR lower(COALESCE(v_profile.seller_status, '')) = 'approved'
  ) THEN
    RAISE EXCEPTION 'Approved seller access required.';
  END IF;

  SELECT * INTO v_account
  FROM public.payout_accounts
  WHERE id = p_payout_account_id
    AND user_id = p_user_id
    AND lower(COALESCE(status, 'active')) = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active payout account not found.';
  END IF;

  v_amount := round(COALESCE(p_amount, 0), 2);
  IF v_amount < 50000 THEN
    RAISE EXCEPTION 'Minimum withdrawal is 50000.';
  END IF;
  IF v_amount > 100000000 THEN
    RAISE EXCEPTION 'Maximum withdrawal is 100000000.';
  END IF;

  INSERT INTO public.wallets (user_id, balance, pending_balance, status, created_at, updated_at)
  VALUES (p_user_id, 0, 0, 'active', now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found.';
  END IF;

  IF lower(COALESCE(v_wallet.status, 'active')) <> 'active' THEN
    RAISE EXCEPTION 'Wallet is not active.';
  END IF;

  v_before := COALESCE(v_wallet.balance, 0);
  IF v_before < v_amount THEN
    RAISE EXCEPTION 'Insufficient available wallet balance.';
  END IF;

  v_after := v_before - v_amount;
  v_hold_hours := LEAST(GREATEST(COALESCE(p_hold_hours, 24), 0), 168);
  v_last4 := COALESCE(NULLIF(v_account.account_last4, ''), '****');

  UPDATE public.wallets
  SET balance = v_after, updated_at = now()
  WHERE id = v_wallet.id;

  INSERT INTO public.withdrawal_requests (
    user_id, wallet_id, payout_account_id, amount, fee_amount, net_amount,
    currency, payout_method, payout_account_name, payout_account_number,
    payout_ciphertext, payout_iv, payout_auth_tag, payout_key_version,
    payout_note, status, provider_status, request_key, eligible_at,
    created_at, updated_at
  ) VALUES (
    p_user_id, v_wallet.id, v_account.id, v_amount, 0, v_amount,
    COALESCE(NULLIF(v_account.currency, ''), 'IDR'),
    v_account.method,
    v_account.account_name,
    '****' || v_last4,
    v_account.ciphertext, v_account.iv, v_account.auth_tag, v_account.key_version,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    'pending', 'queued', p_request_key,
    now() + make_interval(hours => v_hold_hours),
    now(), now()
  )
  RETURNING * INTO v_request;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, transaction_type, amount,
    balance_before, balance_after, status, description, metadata, created_at, updated_at
  ) VALUES (
    v_wallet.id, p_user_id, 'withdraw_request', 'withdraw_request', -v_amount,
    v_before, v_after, 'pending',
    'Seller withdrawal request #' || v_request.id,
    jsonb_build_object(
      'withdrawal_id', v_request.id,
      'payout_account_id', v_account.id,
      'request_key', p_request_key
    ),
    now(), now()
  );

  INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
  VALUES (
    p_user_id,
    'withdrawal',
    'Withdrawal Requested',
    'Your withdrawal request #' || v_request.id || ' is queued for review.',
    '/seller/payouts',
    false
  );

  RETURN jsonb_build_object(
    'already_created', false,
    'withdrawal_id', v_request.id,
    'status', v_request.status,
    'amount', v_request.amount,
    'balance_before', v_before,
    'balance_after', v_after,
    'eligible_at', v_request.eligible_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_cancel_withdrawal_request_v10(
  p_withdrawal_id bigint,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_before numeric;
  v_after numeric;
  v_existing_refund bigint;
BEGIN
  SELECT * INTO v_request
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found.';
  END IF;

  IF lower(COALESCE(v_request.status, '')) <> 'pending' THEN
    RAISE EXCEPTION 'Only pending withdrawal requests can be cancelled.';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = v_request.wallet_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found.';
  END IF;

  SELECT id INTO v_existing_refund
  FROM public.wallet_transactions
  WHERE metadata->>'withdrawal_id' = v_request.id::text
    AND COALESCE(type, transaction_type) IN ('withdraw_cancelled_refund', 'withdraw_rejected_refund', 'withdraw_failed_refund')
  LIMIT 1;

  v_before := COALESCE(v_wallet.balance, 0);
  v_after := v_before;

  IF v_existing_refund IS NULL THEN
    v_after := v_before + COALESCE(v_request.amount, 0);

    UPDATE public.wallets
    SET balance = v_after, updated_at = now()
    WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
      wallet_id, user_id, type, transaction_type, amount,
      balance_before, balance_after, status, description, metadata, created_at, updated_at
    ) VALUES (
      v_wallet.id, p_user_id,
      'withdraw_cancelled_refund', 'withdraw_cancelled_refund', COALESCE(v_request.amount, 0),
      v_before, v_after, 'completed',
      'Withdrawal request cancelled and balance returned.',
      jsonb_build_object('withdrawal_id', v_request.id),
      now(), now()
    );
  END IF;

  UPDATE public.withdrawal_requests
  SET
    status = 'cancelled',
    provider_status = 'cancelled_by_seller',
    cancelled_at = now(),
    processed_at = now(),
    updated_at = now()
  WHERE id = v_request.id;

  UPDATE public.wallet_transactions
  SET status = 'rejected', updated_at = now()
  WHERE metadata->>'withdrawal_id' = v_request.id::text
    AND COALESCE(type, transaction_type) = 'withdraw_request';

  INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
  VALUES (
    p_user_id,
    'withdrawal',
    'Withdrawal Cancelled',
    'Withdrawal request #' || v_request.id || ' was cancelled and the balance was returned.',
    '/seller/payouts',
    false
  );

  RETURN jsonb_build_object(
    'withdrawal_id', v_request.id,
    'status', 'cancelled',
    'balance_before', v_before,
    'balance_after', v_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_admin_process_withdrawal_v10(
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
  v_net numeric;
  v_existing_refund bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND lower(COALESCE(role, '')) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found.';
  END IF;

  v_status := lower(COALESCE(v_request.status, 'pending'));

  IF v_status IN ('paid', 'rejected', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'already_processed', true,
      'withdrawal_id', v_request.id,
      'status', v_request.status
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for this withdrawal.';
  END IF;

  v_before := COALESCE(v_wallet.balance, 0);
  v_after := v_before;
  v_fee := LEAST(v_fee, COALESCE(v_request.amount, 0));
  v_net := GREATEST(COALESCE(v_request.amount, 0) - v_fee, 0);

  IF v_action = 'approve' THEN
    UPDATE public.withdrawal_requests
    SET
      status = 'approved',
      admin_note = COALESCE(v_note, admin_note),
      fee_amount = v_fee,
      net_amount = v_net,
      payout_provider = COALESCE(v_provider, payout_provider),
      provider_status = 'approved',
      approved_at = COALESCE(approved_at, now()),
      updated_at = now()
    WHERE id = v_request.id;

  ELSIF v_action = 'processing' THEN
    UPDATE public.withdrawal_requests
    SET
      status = 'processing',
      admin_note = COALESCE(v_note, admin_note),
      fee_amount = v_fee,
      net_amount = v_net,
      payout_provider = COALESCE(v_provider, payout_provider),
      provider_status = 'processing',
      approved_at = COALESCE(approved_at, now()),
      processing_at = COALESCE(processing_at, now()),
      updated_at = now()
    WHERE id = v_request.id;

  ELSIF v_action = 'paid' THEN
    UPDATE public.withdrawal_requests
    SET
      status = 'paid',
      admin_note = COALESCE(v_note, admin_note),
      fee_amount = v_fee,
      net_amount = v_net,
      payout_reference = v_reference,
      payout_provider = COALESCE(v_provider, payout_provider),
      provider_status = 'settled',
      approved_at = COALESCE(approved_at, now()),
      processing_at = COALESCE(processing_at, now()),
      paid_at = now(),
      processed_at = now(),
      updated_at = now()
    WHERE id = v_request.id;

    UPDATE public.wallets
    SET
      total_withdrawn = COALESCE(total_withdrawn, 0) + COALESCE(v_request.amount, 0),
      updated_at = now()
    WHERE id = v_wallet.id;

    UPDATE public.wallet_transactions
    SET
      type = 'withdraw_paid',
      transaction_type = 'withdraw_paid',
      status = 'completed',
      description = 'Withdrawal paid. Reference: ' || v_reference,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'withdrawal_id', v_request.id,
        'admin_id', p_admin_id,
        'payout_reference', v_reference,
        'payout_provider', v_provider,
        'fee_amount', v_fee,
        'net_amount', v_net
      ),
      updated_at = now()
    WHERE metadata->>'withdrawal_id' = v_request.id::text
      AND COALESCE(type, transaction_type) IN ('withdraw_request', 'withdraw_approved');

  ELSE
    SELECT id INTO v_existing_refund
    FROM public.wallet_transactions
    WHERE metadata->>'withdrawal_id' = v_request.id::text
      AND COALESCE(type, transaction_type) IN ('withdraw_rejected_refund', 'withdraw_failed_refund', 'withdraw_cancelled_refund')
    LIMIT 1;

    IF v_existing_refund IS NULL THEN
      v_after := v_before + COALESCE(v_request.amount, 0);

      UPDATE public.wallets
      SET balance = v_after, updated_at = now()
      WHERE id = v_wallet.id;

      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, transaction_type, amount,
        balance_before, balance_after, status, description, metadata, created_at, updated_at
      ) VALUES (
        v_wallet.id, v_request.user_id,
        CASE WHEN v_action = 'reject' THEN 'withdraw_rejected_refund' ELSE 'withdraw_failed_refund' END,
        CASE WHEN v_action = 'reject' THEN 'withdraw_rejected_refund' ELSE 'withdraw_failed_refund' END,
        COALESCE(v_request.amount, 0),
        v_before, v_after, 'completed',
        CASE WHEN v_action = 'reject'
          THEN 'Withdrawal rejected and balance returned. '
          ELSE 'Withdrawal failed and balance returned. '
        END || COALESCE(v_note, ''),
        jsonb_build_object('withdrawal_id', v_request.id, 'admin_id', p_admin_id),
        now(), now()
      );
    END IF;

    UPDATE public.withdrawal_requests
    SET
      status = CASE WHEN v_action = 'reject' THEN 'rejected' ELSE 'failed' END,
      admin_note = v_note,
      payout_reference = COALESCE(v_reference, payout_reference),
      payout_provider = COALESCE(v_provider, payout_provider),
      provider_status = CASE WHEN v_action = 'reject' THEN 'rejected' ELSE 'failed' END,
      failed_at = CASE WHEN v_action = 'fail' THEN now() ELSE failed_at END,
      processed_at = now(),
      updated_at = now()
    WHERE id = v_request.id;

    UPDATE public.wallet_transactions
    SET
      status = 'rejected',
      description = COALESCE(v_note, description),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('admin_id', p_admin_id),
      updated_at = now()
    WHERE metadata->>'withdrawal_id' = v_request.id::text
      AND COALESCE(type, transaction_type) IN ('withdraw_request', 'withdraw_approved');
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link_url, is_read)
  VALUES (
    v_request.user_id,
    'withdrawal',
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
      WHEN 'paid' THEN 'Withdrawal request #' || v_request.id || ' was paid. Reference: ' || v_reference
      WHEN 'reject' THEN 'Withdrawal request #' || v_request.id || ' was rejected and the balance was returned.'
      ELSE 'Withdrawal request #' || v_request.id || ' failed and the balance was returned.'
    END,
    '/seller/payouts',
    false
  );

  RETURN jsonb_build_object(
    'already_processed', false,
    'withdrawal_id', v_request.id,
    'action', v_action,
    'balance_before', v_before,
    'balance_after', v_after,
    'fee_amount', v_fee,
    'net_amount', v_net
  );
END;
$$;

-- Keep the V4 signature available for older code. V10 routes use the richer function above.
CREATE OR REPLACE FUNCTION public.cp_admin_process_withdrawal(
  p_withdrawal_id bigint,
  p_admin_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.cp_admin_process_withdrawal_v10(
    p_withdrawal_id,
    p_admin_id,
    p_action,
    p_note,
    NULL,
    NULL,
    0,
    true
  );
$$;

ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_payout_accounts_owner_read ON public.payout_accounts;
CREATE POLICY cp_payout_accounts_owner_read
ON public.payout_accounts
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS cp_withdrawal_requests_owner_read ON public.withdrawal_requests;
CREATE POLICY cp_withdrawal_requests_owner_read
ON public.withdrawal_requests
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(COALESCE(profiles.role, '')) = 'admin'
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.payout_accounts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawal_requests FROM anon, authenticated;
GRANT SELECT ON public.payout_accounts TO authenticated;
GRANT SELECT ON public.withdrawal_requests TO authenticated;

REVOKE ALL ON FUNCTION public.cp_create_withdrawal_request_v10(uuid, bigint, numeric, text, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_cancel_withdrawal_request_v10(bigint, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_admin_process_withdrawal_v10(bigint, uuid, text, text, text, text, numeric, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cp_admin_process_withdrawal(bigint, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cp_create_withdrawal_request_v10(uuid, bigint, numeric, text, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_cancel_withdrawal_request_v10(bigint, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_admin_process_withdrawal_v10(bigint, uuid, text, text, text, text, numeric, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cp_admin_process_withdrawal(bigint, uuid, text, text)
  TO service_role;

COMMIT;

SELECT
  'comeplayers_seller_payout_center_v10_ready' AS status,
  (SELECT count(*) FROM public.payout_accounts) AS payout_accounts_count,
  (SELECT count(*) FROM public.withdrawal_requests) AS withdrawal_requests_count;
