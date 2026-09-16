-- CPWallet keeps the existing IDR ledger. FX is a display/quote conversion only.
-- No balances or historic transactions are rewritten.
CREATE TABLE public.cp_wallet_topup_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 wallet_id bigint NOT NULL REFERENCES public.wallets(id),
 request_key uuid NOT NULL,
 provider text NOT NULL CHECK (provider IN ('doku','paypal')),
 amount_idr numeric NOT NULL CHECK (amount_idr BETWEEN 10000 AND 10000000 AND amount_idr=trunc(amount_idr)),
 display_amount numeric NOT NULL CHECK(display_amount>0),
 display_currency text NOT NULL,
 idr_per_unit numeric NOT NULL CHECK(idr_per_unit>0),
 rate_date date NOT NULL,
 charge_amount numeric NOT NULL CHECK(charge_amount>0 AND charge_amount=round(charge_amount,2)),
 charge_currency text NOT NULL,
 status text NOT NULL DEFAULT 'quoted' CHECK(status IN ('quoted','starting','pending','credited','review')),
 provider_order_id text,
 provider_capture_id text,
 checkout_url text,
 quote_expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 payment_expires_at timestamptz,
 credited_at timestamptz,
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key),
 UNIQUE(provider,provider_order_id),
 UNIQUE(provider,provider_capture_id),
 CHECK ((provider='doku' AND charge_currency='IDR' AND charge_amount=amount_idr) OR (provider='paypal' AND charge_currency='USD'))
);
CREATE INDEX cp_wallet_topup_owner_history ON public.cp_wallet_topup_intents(user_id,created_at DESC);
CREATE INDEX cp_wallet_topup_wallet_idx ON public.cp_wallet_topup_intents(wallet_id);
ALTER TABLE public.cp_wallet_topup_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cp_wallet_topup_intents FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.cp_wallet_topup_intents TO service_role;
-- All reads go through the authenticated owner API; provider references stay server-side.

ALTER TABLE public.wallet_topups ADD COLUMN payment_intent_id uuid REFERENCES public.cp_wallet_topup_intents(id);
CREATE UNIQUE INDEX wallet_topups_payment_intent_unique ON public.wallet_topups(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX wallet_transactions_cpw_intent_unique ON public.wallet_transactions((metadata->>'cpwallet_intent_id')) WHERE type='deposit' AND metadata ? 'cpwallet_intent_id';
ALTER TABLE public.orders ADD COLUMN external_payment_started boolean NOT NULL DEFAULT false;

-- These legacy SECURITY DEFINER entry points accepted caller-provided credit/discount amounts.
DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname IN ('credit_wallet_paypal_topup','checkout_wallet_order') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
 END LOOP;
END $$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.wallets,public.wallet_topups,public.wallet_transactions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cp_create_wallet_topup_quote(p_user_id uuid,p_request_key uuid,p_provider text,p_quote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.wallets%ROWTYPE; t public.cp_wallet_topup_intents%ROWTYPE;
BEGIN
 INSERT INTO wallets(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO w FROM wallets WHERE user_id=p_user_id FOR UPDATE;
 IF w.status<>'active' THEN RAISE EXCEPTION 'Your CPWallet is frozen.'; END IF;
 SELECT * INTO t FROM cp_wallet_topup_intents WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN RETURN to_jsonb(t); END IF;
 IF (SELECT count(*) FROM cp_wallet_topup_intents WHERE user_id=p_user_id AND created_at>now()-interval '1 hour')>=30 THEN
  RAISE EXCEPTION 'Too many top-up requests. Please try again later.';
 END IF;
 INSERT INTO cp_wallet_topup_intents(user_id,wallet_id,request_key,provider,amount_idr,display_amount,display_currency,idr_per_unit,rate_date,charge_amount,charge_currency)
 VALUES(p_user_id,w.id,p_request_key,p_provider,(p_quote->>'amount_idr')::numeric,(p_quote->>'display_amount')::numeric,p_quote->>'display_currency',
 (p_quote->>'idr_per_unit')::numeric,(p_quote->>'rate_date')::date,(p_quote->>'charge_amount')::numeric,p_quote->>'charge_currency') RETURNING * INTO t;
 RETURN to_jsonb(t);
END $$;

CREATE OR REPLACE FUNCTION public.cp_start_wallet_topup(p_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.cp_wallet_topup_intents%ROWTYPE; w public.wallets%ROWTYPE;
BEGIN
 SELECT * INTO t FROM cp_wallet_topup_intents WHERE id=p_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Top-up not found.'; END IF;
 IF t.status IN ('pending','credited','review','starting') THEN RETURN to_jsonb(t); END IF;
 IF t.quote_expires_at<=now() THEN RAISE EXCEPTION 'This quote expired. Create a new quote.'; END IF;
 SELECT * INTO w FROM wallets WHERE id=t.wallet_id AND user_id=t.user_id FOR UPDATE;
 IF NOT FOUND OR w.status<>'active' THEN RAISE EXCEPTION 'CPWallet is frozen or unavailable.'; END IF;
 UPDATE cp_wallet_topup_intents SET status='starting',updated_at=now(),payment_expires_at=now()+interval '55 minutes'
 WHERE id=p_id RETURNING * INTO t;
 RETURN to_jsonb(t)||jsonb_build_object('start_claimed',true);
END $$;

CREATE OR REPLACE FUNCTION public.cp_credit_wallet_topup(p_id uuid,p_provider text,p_provider_order_id text,p_capture_id text,p_amount numeric,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.cp_wallet_topup_intents%ROWTYPE; w public.wallets%ROWTYPE; topup_id bigint;
BEGIN
 SELECT * INTO t FROM cp_wallet_topup_intents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Top-up not found.'; END IF;
 IF p_provider IS DISTINCT FROM t.provider OR p_amount IS DISTINCT FROM t.charge_amount OR p_currency IS DISTINCT FROM t.charge_currency
 OR nullif(p_provider_order_id,'') IS NULL OR (t.provider_order_id IS NOT NULL AND t.provider_order_id<>p_provider_order_id)
 OR nullif(p_capture_id,'') IS NULL THEN RAISE EXCEPTION 'Payment does not match the saved top-up.'; END IF;
 IF t.provider='doku' AND p_provider_order_id<>'CPW-'||replace(t.id::text,'-','') THEN RAISE EXCEPTION 'Top-up invoice mismatch.'; END IF;
 IF t.status='review' THEN RAISE EXCEPTION 'This top-up requires payment review.'; END IF;
 IF t.status='credited' THEN
   IF t.provider_capture_id<>p_capture_id THEN RAISE EXCEPTION 'Top-up was already credited with a different payment.'; END IF;
   RETURN jsonb_build_object('already_credited',true,'amount_idr',t.amount_idr);
 END IF;
 IF t.status NOT IN ('starting','pending') THEN RAISE EXCEPTION 'Top-up has not started.'; END IF;
 SELECT * INTO w FROM wallets WHERE id=t.wallet_id AND user_id=t.user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CPWallet not found.'; END IF;
 -- A payment received for a frozen wallet is recorded, but the wallet remains frozen.
 INSERT INTO wallet_topups(user_id,wallet_id,amount,payment_method,payment_note,status,processed_at,payment_intent_id)
 VALUES(t.user_id,t.wallet_id,t.amount_idr,CASE WHEN t.provider='paypal' THEN 'PayPal' ELSE 'DOKU' END,
 'CPWallet payment: '||p_provider_order_id,'approved',now(),t.id) RETURNING id INTO topup_id;
 INSERT INTO wallet_transactions(wallet_id,user_id,type,transaction_type,amount,balance_before,balance_after,status,description,metadata)
 VALUES(t.wallet_id,t.user_id,'deposit','deposit',t.amount_idr,w.balance,w.balance+t.amount_idr,'completed',
 'CPWallet top-up',jsonb_build_object('cpwallet_intent_id',t.id,'topup_id',topup_id,'provider',t.provider,'currency','IDR','charge_currency',t.charge_currency,'charge_amount',t.charge_amount));
 UPDATE wallets SET balance=balance+t.amount_idr,updated_at=now() WHERE id=w.id;
 UPDATE cp_wallet_topup_intents SET status='credited',provider_order_id=p_provider_order_id,provider_capture_id=p_capture_id,credited_at=now(),updated_at=now() WHERE id=t.id;
 INSERT INTO notifications(user_id,type,title,message,link_url,is_read)
 VALUES(t.user_id,'wallet_topup','CPWallet top-up received','Your payment was confirmed and your CPWallet balance is ready to use.','/wallet',false);
 RETURN jsonb_build_object('already_credited',false,'amount_idr',t.amount_idr,'balance_idr',w.balance+t.amount_idr);
END $$;

CREATE OR REPLACE FUNCTION public.cp_review_wallet_topup(p_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.cp_wallet_topup_intents%ROWTYPE;
BEGIN
 SELECT * INTO t FROM cp_wallet_topup_intents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Top-up not found.'; END IF;
 IF t.status='review' THEN RETURN; END IF;
 UPDATE wallets SET status='frozen',updated_at=now() WHERE id=t.wallet_id;
 UPDATE cp_wallet_topup_intents SET status='review',review_reason=left(p_reason,500),updated_at=now() WHERE id=t.id;
 INSERT INTO notifications(user_id,type,title,message,link_url,is_read)
 VALUES(t.user_id,'wallet_review','CPWallet payment review','A payment reversal requires review. Spending is paused; contact support with your top-up reference.','/wallet',false);
END $$;

CREATE OR REPLACE FUNCTION public.cp_claim_external_order_payment(p_order_id bigint,p_buyer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
 SELECT * INTO o FROM orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'Order not found.'; END IF;
 IF lower(coalesce(o.payment_status,''))='paid' OR lower(coalesce(o.status,'')) IN ('paid','delivered','completed','cancelled','expired','refunded') THEN
  RAISE EXCEPTION 'This order is no longer available for payment.';
 END IF;
 UPDATE orders SET external_payment_started=true WHERE id=o.id;
END $$;

CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(p_order_id bigint,p_buyer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; w public.wallets%ROWTYPE; total numeric;
BEGIN
 SELECT * INTO o FROM orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
 IF o.buyer_id IS DISTINCT FROM p_buyer_id THEN RAISE EXCEPTION 'Buyer mismatch for this order.'; END IF;
 IF lower(coalesce(o.payment_status,''))='paid' OR lower(coalesce(o.status,'')) IN ('paid','delivered','completed') THEN
   RETURN jsonb_build_object('already_paid',true,'order_id',o.id,'seller_id',o.seller_id);
 END IF;
 IF lower(coalesce(o.status,'')) IN ('cancelled','expired','refunded','disputed','refund_pending') THEN RAISE EXCEPTION 'This order is not active for payment.'; END IF;
 IF o.external_payment_started OR nullif(o.invoice_number,'') IS NOT NULL OR nullif(o.paypal_order_id,'') IS NOT NULL THEN
   RAISE EXCEPTION 'An external payment has already started. Continue that payment or create a new order for CPWallet.';
 END IF;
 IF coalesce(o.currency_code,'IDR')<>'IDR' THEN RAISE EXCEPTION 'Unsupported order currency.'; END IF;
 total:=coalesce(nullif(o.total_amount,0),nullif(o.total_price,0),0);
 IF total<=0 OR total<>trunc(total) THEN RAISE EXCEPTION 'Invalid order total.'; END IF;
 SELECT * INTO w FROM wallets WHERE user_id=p_buyer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CPWallet not found. Add funds first.'; END IF;
 IF w.status<>'active' THEN RAISE EXCEPTION 'Your CPWallet is frozen.'; END IF;
 IF w.balance<total THEN RAISE EXCEPTION 'Insufficient CPWallet balance.'; END IF;
 PERFORM cp_consume_order_reservation(o.id,p_buyer_id);
 INSERT INTO wallet_transactions(wallet_id,user_id,type,transaction_type,amount,balance_before,balance_after,order_id,description,status)
 VALUES(w.id,p_buyer_id,'buyer_order_payment','buyer_order_payment',-total,w.balance,w.balance-total,o.id,'CPWallet purchase for order #'||o.id,'completed');
 UPDATE wallets SET balance=balance-total,total_spent=coalesce(total_spent,0)+total,updated_at=now() WHERE id=w.id;
 UPDATE orders SET status='paid',payment_status='paid',payment_method='wallet',paid_at=now(),escrow_status='holding',reservation_status='consumed',updated_at=now() WHERE id=o.id;
 RETURN jsonb_build_object('already_paid',false,'order_id',o.id,'seller_id',o.seller_id,'total',total,'balance_idr',w.balance-total);
END $$;

CREATE OR REPLACE FUNCTION public.cp_refund_order_to_wallet(p_order_id bigint,p_admin_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; w public.wallets%ROWTYPE; total numeric; quantity integer;
BEGIN
 IF NOT coalesce(cp_is_admin(p_admin_id),false) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A refund reason is required.'; END IF;
 SELECT * INTO o FROM orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
 IF o.status='refunded' OR o.payment_status='refunded' THEN RETURN jsonb_build_object('already_refunded',true); END IF;
 IF o.escrow_status='released' OR o.seller_payout_status IN ('released','paid') THEN RAISE EXCEPTION 'Escrow has already been released. Reverse the seller payout before refunding.'; END IF;
 IF o.payment_status IS DISTINCT FROM 'paid' OR o.status IN ('refund_pending','cancelled','expired') OR nullif(o.refund_reference,'') IS NOT NULL THEN
   RAISE EXCEPTION 'Only confirmed payments without an existing external refund can be refunded to CPWallet.';
 END IF;
 IF coalesce(o.currency_code,'IDR')<>'IDR' THEN RAISE EXCEPTION 'Unsupported refund currency.'; END IF;
 total:=coalesce(nullif(o.total_amount,0),nullif(o.total_price,0),0);
 IF total<=0 OR total<>trunc(total) OR o.buyer_id IS NULL THEN RAISE EXCEPTION 'Invalid refund amount or buyer.'; END IF;
 IF EXISTS(SELECT FROM wallet_transactions WHERE order_id=o.id AND type IN ('order_refund','refund')) THEN RAISE EXCEPTION 'An existing wallet refund requires reconciliation.'; END IF;
 INSERT INTO wallets(user_id) VALUES(o.buyer_id) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO w FROM wallets WHERE user_id=o.buyer_id FOR UPDATE;
 INSERT INTO wallet_transactions(wallet_id,user_id,type,transaction_type,amount,balance_before,balance_after,order_id,description,status,metadata)
 VALUES(w.id,o.buyer_id,'order_refund','order_refund',total,w.balance,w.balance+total,o.id,'Product refund for order #'||o.id,'completed',jsonb_build_object('admin_id',p_admin_id,'reason',left(p_reason,1000),'currency','IDR'));
 UPDATE wallets SET balance=balance+total,updated_at=now() WHERE id=w.id;
 -- Restore the reserved variant, not the parent product, exactly once under the order lock.
 quantity:=greatest(coalesce(o.quantity,1),1);
 IF o.variant_id IS NOT NULL THEN
  UPDATE product_variants SET stock=coalesce(stock,0)+quantity,updated_at=now() WHERE id=o.variant_id AND product_id=o.product_id;
 ELSE
  UPDATE products SET stock=coalesce(stock,0)+quantity,updated_at=now() WHERE id=o.product_id;
 END IF;
 UPDATE product_stock_reservations SET status='released',released_at=now(),release_reason='cpwallet_refund',updated_at=now() WHERE order_id=o.id AND status='consumed';
 UPDATE orders SET status='refunded',payment_status='refunded',escrow_status='refunded',seller_payout_status='cancelled',refund_amount=total,
   refund_reason=left(p_reason,1000),refund_reference='CPW-REFUND-'||o.id,refunded_at=now(),refunded_by=p_admin_id,updated_at=now() WHERE id=o.id;
 INSERT INTO notifications(user_id,type,title,message,link_url,is_read)
 VALUES(o.buyer_id,'order_refund','Refund credited to CPWallet','Your refund for order #'||o.id||' is available in CPWallet.','/wallet',false);
 IF o.seller_id IS NOT NULL THEN
  INSERT INTO notifications(user_id,type,title,message,link_url,is_read) VALUES(o.seller_id,'order_refund','Order refunded','Order #'||o.id||' was refunded to the buyer.','/orders/'||o.id,false);
 END IF;
 RETURN jsonb_build_object('already_refunded',false,'refund_amount',total,'refund_channel','wallet','balance_idr',w.balance+total);
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname IN ('cp_create_wallet_topup_quote','cp_start_wallet_topup','cp_credit_wallet_topup','cp_review_wallet_topup','cp_claim_external_order_payment','pay_order_with_wallet','cp_refund_order_to_wallet') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
CREATE OR REPLACE FUNCTION public.credit_wallet_paypal_topup(p_user_id uuid, p_paypal_order_id text, p_amount_idr numeric, p_paypal_amount_usd numeric, p_payer_name text DEFAULT NULL::text, p_payer_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wallet wallets%rowtype;
  v_existing_topup wallet_topups%rowtype;
  v_balance_before numeric := 0;
  v_balance_after numeric := 0;
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  if coalesce(v_jwt_role, '') <> 'service_role' then
    raise exception 'Unauthorized. PayPal topup must be executed by server service role.';
  end if;

  if p_user_id is null then
    raise exception 'User ID is required.';
  end if;

  if coalesce(p_paypal_order_id, '') = '' then
    raise exception 'PayPal order ID is required.';
  end if;

  if coalesce(p_amount_idr, 0) <= 0 then
    raise exception 'Top up amount must be greater than zero.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cpwallet-legacy-paypal:' || p_paypal_order_id, 0));

  select *
  into v_existing_topup
  from wallet_topups
  where payment_method = 'PayPal'
    and payment_note = 'PayPal Order ID: ' || p_paypal_order_id
  for update;

  if found then
    return jsonb_build_object(
      'duplicated', true,
      'amount_idr', v_existing_topup.amount,
      'message', 'PayPal order already processed.'
    );
  end if;

  insert into wallets (
    user_id, balance, pending_balance, total_earned,
    total_spent, total_withdrawn, status, created_at, updated_at
  )
  values (
    p_user_id, 0, 0, 0, 0, 0, 'active', now(), now()
  )
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from wallets
  where user_id = p_user_id
  for update;

  if lower(coalesce(v_wallet.status, '')) <> 'active' then
    raise exception 'Wallet is frozen.';
  end if;

  v_balance_before := coalesce(v_wallet.balance::numeric, 0);
  v_balance_after := v_balance_before + p_amount_idr;

  update wallets
  set balance = v_balance_after,
      status = 'active',
      updated_at = now()
  where id = v_wallet.id;

  insert into wallet_topups (
    user_id, wallet_id, amount, payment_method, sender_name, sender_account,
    payment_note, payment_image, status, admin_note, processed_at, created_at
  )
  values (
    p_user_id, v_wallet.id, p_amount_idr, 'PayPal',
    coalesce(nullif(p_payer_name, ''), 'PayPal User'), p_payer_email,
    'PayPal Order ID: ' || p_paypal_order_id, null, 'approved',
    'Auto approved by PayPal. USD ' || coalesce(p_paypal_amount_usd, 0)::text,
    now(), now()
  );

  insert into wallet_transactions (
    user_id, wallet_id, type, amount, balance_before, balance_after,
    description, status, created_at
  )
  values (
    p_user_id, v_wallet.id, 'deposit', p_amount_idr,
    v_balance_before, v_balance_after,
    'PayPal wallet top up - Order ' || p_paypal_order_id,
    'completed', now()
  );

  return jsonb_build_object(
    'duplicated', false,
    'amount_idr', p_amount_idr,
    'old_balance', v_balance_before,
    'new_balance', v_balance_after
  );
end;
$function$

;
REVOKE ALL ON FUNCTION public.credit_wallet_paypal_topup(uuid,text,numeric,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_paypal_topup(uuid,text,numeric,numeric,text,text) TO service_role;
