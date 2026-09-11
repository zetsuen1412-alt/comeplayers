-- ComePlayers Order Delivery + Escrow Migration
-- Run this once in Supabase SQL Editor.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS escrow_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS delivery_message text,
ADD COLUMN IF NOT EXISTS delivery_credentials text,
ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS paid_at timestamptz,
ADD COLUMN IF NOT EXISTS marketplace_fee_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS seller_earning_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS seller_payout_status text DEFAULT 'pending';

UPDATE public.orders
SET
  escrow_status = CASE
    WHEN lower(COALESCE(status, '')) = 'completed' THEN 'released'
    WHEN lower(COALESCE(status, '')) = 'delivered' THEN 'delivered'
    WHEN lower(COALESCE(payment_status, '')) = 'paid' OR lower(COALESCE(status, '')) = 'paid' THEN 'holding'
    ELSE COALESCE(escrow_status, 'pending')
  END,
  paid_at = CASE
    WHEN paid_at IS NULL AND (lower(COALESCE(payment_status, '')) = 'paid' OR lower(COALESCE(status, '')) = 'paid') THEN now()
    ELSE paid_at
  END;

CREATE TABLE IF NOT EXISTS public.wallets (
  id bigserial PRIMARY KEY,
  user_id uuid UNIQUE,
  balance numeric DEFAULT 0,
  pending_balance numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS user_id uuid,
ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_id_unique_idx ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_escrow_status ON public.orders(escrow_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at ON public.orders(delivered_at);
CREATE INDEX IF NOT EXISTS idx_orders_completed_at ON public.orders(completed_at);

SELECT 'order_delivery_migration_completed' AS status;
