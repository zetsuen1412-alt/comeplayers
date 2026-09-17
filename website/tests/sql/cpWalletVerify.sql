\set ON_ERROR_STOP on
DO $$ DECLARE buyer uuid:='00000000-0000-4000-8000-000000000004'; w wallets%ROWTYPE; paid integer; BEGIN
 SELECT * INTO w FROM wallets WHERE user_id=buyer;
 SELECT count(*) INTO paid FROM orders WHERE buyer_id=buyer AND payment_status='paid';
 ASSERT (SELECT count(*) FROM wallet_transactions WHERE user_id=buyer AND type='deposit')=1,'concurrent callbacks must credit once';
 ASSERT w.balance=100000-paid*10000 AND w.balance>=0,'concurrent spending must preserve the balance';
 ASSERT paid=10 AND w.balance=0,'exactly ten purchases may spend the 100000 credit';
 ASSERT w.total_spent=100000;
 ASSERT (SELECT sum(amount) FROM wallet_transactions WHERE user_id=buyer)=w.balance,'ledger must reconcile';
 PERFORM cp_review_wallet_topup('00000000-0000-4000-8000-000000000020','Fixture provider reversal');
 PERFORM cp_review_wallet_topup('00000000-0000-4000-8000-000000000020','Fixture replay');
 ASSERT (SELECT status FROM wallets WHERE user_id=buyer)='frozen';
 ASSERT (SELECT count(*) FROM notifications WHERE user_id=buyer AND type='wallet_review')=1,'one review notification';
 ASSERT NOT has_function_privilege('anon','credit_wallet_paypal_topup(uuid,text,numeric,numeric,text,text)','EXECUTE');
END $$;
\echo CPWallet financial invariants and concurrent payment tests passed.
