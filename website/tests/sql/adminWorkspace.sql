-- Reuse the isolated CPWallet fixture; never target a production database.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'cpwallet_test' THEN RAISE EXCEPTION 'Isolated fixture database required'; END IF; END $$;
ALTER TABLE products ADD COLUMN status text;
ALTER TABLE orders ADD COLUMN marketplace_fee_amount numeric DEFAULT 0, ADD COLUMN product_title text, ADD COLUMN product text, ADD COLUMN created_at timestamptz DEFAULT now();
CREATE TABLE seller_applications(status text);
CREATE TABLE disputes(status text);
CREATE TABLE withdrawal_requests(status text);
CREATE TABLE support_tickets(status text);
\ir ../../supabase/migrations/20260916182015_admin_workspace_overview.sql
DO $$ DECLARE before_snapshot jsonb; after_snapshot jsonb; BEGIN
 before_snapshot:=cp_admin_workspace_overview();
 INSERT INTO orders(id,total_amount,total_price,marketplace_fee_amount,status,payment_status,currency_code)
 SELECT n,100,100,5,'completed','paid','IDR' FROM generate_series(1000,2004) n;
 INSERT INTO orders(id,total_amount,status,payment_status) VALUES(2005,999999999,'expired','expired'),(2006,999999999,'refunded','refunded'),(2007,999999999,'completed','unpaid');
 after_snapshot:=cp_admin_workspace_overview();
 ASSERT (after_snapshot#>>'{metrics,grossVolume}')::numeric-(before_snapshot#>>'{metrics,grossVolume}')::numeric=100500,'sum every completed paid order beyond the API row limit';
 ASSERT (after_snapshot#>>'{metrics,feeRevenue}')::numeric-(before_snapshot#>>'{metrics,feeRevenue}')::numeric=5025,'fees use the same completed paid scope';
 ASSERT (after_snapshot#>>'{metrics,completedOrders}')::int-(before_snapshot#>>'{metrics,completedOrders}')::int=1005;
 ASSERT (after_snapshot#>>'{metrics,walletBalance}')::numeric=(SELECT sum(balance) FROM wallets),'wallet liability stays separate from revenue';
 ASSERT jsonb_array_length(after_snapshot->'recentOrders')=8;
 ASSERT after_snapshot->>'ledgerCurrency'='IDR';
 ASSERT NOT has_function_privilege('authenticated','cp_admin_workspace_overview()','EXECUTE');
 ASSERT NOT has_function_privilege('anon','cp_admin_workspace_overview()','EXECUTE');
 ASSERT has_function_privilege('service_role','cp_admin_workspace_overview()','EXECUTE');
END $$;
