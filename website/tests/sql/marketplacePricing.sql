-- Isolated CI database only. All rows and functions are rolled back.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE products(id bigint PRIMARY KEY, title text, price text, seller_id uuid, seller_name text,
 seller text, game_name text, category text, stock integer, status text, has_variants boolean, updated_at timestamptz);
CREATE TABLE product_variants(id bigint PRIMARY KEY, product_id bigint, seller_id uuid, sku text,
 name text, price numeric, stock integer, status text, updated_at timestamptz);
CREATE TABLE coupons(id bigint PRIMARY KEY, code text, status text, discount_type text, discount_value numeric,
 minimum_order_amount numeric, maximum_discount_amount numeric, usage_limit integer, used_count integer,
 start_at timestamptz, end_at timestamptz);
CREATE TABLE orders(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, buyer_id uuid, seller_id uuid,
 product_id bigint, variant_id bigint, variant_name text, variant_sku text, quantity integer,
 subtotal_amount numeric, discount_amount numeric, payment_fee_amount numeric, total_price numeric,
 total_amount numeric, price text, status text, payment_status text, payment_method text,
 product_title text, seller_name text, game_name text, category text, coupon_id bigint, coupon_code text,
 currency_code text, escrow_status text, reservation_status text, reservation_expires_at timestamptz,
 created_at timestamptz, updated_at timestamptz);
CREATE TABLE product_stock_reservations(order_id bigint, product_id bigint, variant_id bigint, buyer_id uuid,
 quantity integer, status text, expires_at timestamptz, created_at timestamptz, updated_at timestamptz);
CREATE TABLE coupon_usages(coupon_id bigint, user_id uuid, order_id bigint, original_amount numeric,
 discount_amount numeric, final_amount numeric, status text, created_at timestamptz);
CREATE FUNCTION cp_to_numeric(value text) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(value, '[^0-9]', '', 'g')::numeric $$;
CREATE FUNCTION cp_release_expired_stock_reservations(lim integer) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE FUNCTION cp_apply_seller_tax_v23(p_order_id bigint,p_buyer_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_tax',true)='true' THEN RAISE EXCEPTION 'fixture tax failure'; END IF;
  RETURN (SELECT jsonb_build_object('id',id,'total',total_amount) FROM orders WHERE id=p_order_id AND buyer_id=p_buyer_id);
END $$;
CREATE FUNCTION create_marketplace_order_doku_usd_v1(p_buyer_id uuid,p_product_id bigint,p_variant_id bigint,
 p_quantity integer,p_coupon_code text,p_reservation_minutes integer,p_idr_per_usd numeric)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
 result:=create_marketplace_order_usd_v1(p_buyer_id,p_product_id,p_variant_id,p_quantity,'wallet',p_coupon_code,0,p_reservation_minutes,p_idr_per_usd);
 UPDATE orders SET payment_method='doku' WHERE id=(result->>'id')::bigint;
 RETURN jsonb_set(result,'{payment_method}','"doku"');
END $$;

\ir ../../supabase/migrations/20260916142914_marketplace_pricing_consistency.sql

INSERT INTO products(id,title,price,seller_id,stock,status,has_variants) VALUES
 (1,'Fixture product','4.0582','00000000-0000-0000-0000-000000000001',200,'active',false),
 (2,'Fixture variants','1','00000000-0000-0000-0000-000000000001',100,'active',true);
INSERT INTO product_variants VALUES(10,2,'00000000-0000-0000-0000-000000000001','FIXTURE','Variant',2.5,100,'active',now());
INSERT INTO coupons VALUES
 (1,'PERCENT','active','percent',12.5,0,10000,NULL,0,NULL,NULL),
 (2,'FIXED','active','fixed',5000,50000,NULL,NULL,0,NULL,NULL),
 (3,'EXPIRED','active','fixed',100,0,NULL,NULL,0,NULL,now()-interval '1 day');

DO $$
DECLARE q jsonb; o jsonb; n integer; stock_before integer; caught boolean;
 buyer uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
 q:=cp_quote_marketplace_order_usd_v1(1,NULL,3,NULL,17706);
 ASSERT (q->>'unit_price')::numeric=71855, 'unit price must round up before multiplying quantity';
 ASSERT (q->>'subtotal')::numeric=215565;
 ASSERT (SELECT count(*) FROM orders)=0 AND (SELECT stock FROM products WHERE id=1)=200, 'quote must be read-only';
 o:=cp_create_quoted_marketplace_order_v1(buyer,1,NULL,3,NULL,20,17706,q);
 ASSERT o->>'total'=q->>'total';
 ASSERT (SELECT stock FROM products WHERE id=1)=197;
 ASSERT (SELECT count(*) FROM product_stock_reservations)=1;
 ASSERT (SELECT total_amount FROM orders WHERE id=(o->>'id')::bigint)=215565;

 q:=cp_quote_marketplace_order_usd_v1(1,NULL,1,'PERCENT',17706);
 ASSERT (q->>'discount')::numeric=8981, 'percentage discount rounds down to whole IDR';
 ASSERT (q->>'total')::numeric=62874;
 o:=cp_create_quoted_marketplace_order_v1(buyer,1,NULL,1,'PERCENT',20,17706,q);
 ASSERT o->>'total'=q->>'total';
 ASSERT (SELECT used_count FROM coupons WHERE id=1)=1;
 q:=cp_quote_marketplace_order_usd_v1(1,NULL,1,'FIXED',17706);
 ASSERT (q->>'discount')::numeric=5000 AND (q->>'total')::numeric=66855;

 q:=cp_quote_marketplace_order_usd_v1(2,10,2,NULL,17706);
 ASSERT (q->>'total')::numeric=88530;
 o:=cp_create_quoted_marketplace_order_v1(buyer,2,10,2,NULL,20,17706,q);
 ASSERT o->>'total'=q->>'total';
 ASSERT (SELECT stock FROM product_variants WHERE id=10)=98;

 q:=cp_quote_marketplace_order_usd_v1(1,NULL,1,'PERCENT',17706);
 SELECT count(*) INTO n FROM orders;
 SELECT stock INTO stock_before FROM products WHERE id=1;
 UPDATE products SET price='5' WHERE id=1;
 caught:=false;
 BEGIN
  PERFORM cp_create_quoted_marketplace_order_v1(buyer,1,NULL,1,'PERCENT',20,17706,q);
 EXCEPTION WHEN raise_exception THEN caught:=SQLERRM LIKE 'Price changed.%'; END;
 ASSERT caught, 'price changes must reject the old quote';
 ASSERT (SELECT count(*) FROM orders)=n AND (SELECT stock FROM products WHERE id=1)=stock_before, 'failed quote must roll back order and stock';
 ASSERT (SELECT used_count FROM coupons WHERE id=1)=1, 'failed quote must roll back coupon usage';

 caught:=false;
 BEGIN PERFORM cp_quote_marketplace_order_usd_v1(1,NULL,101,NULL,17706);
 EXCEPTION WHEN raise_exception THEN caught:=true; END;
 ASSERT caught;
 caught:=false;
 BEGIN PERFORM cp_quote_marketplace_order_usd_v1(1,NULL,0,NULL,17706);
 EXCEPTION WHEN raise_exception THEN caught:=true; END;
 ASSERT caught;
 caught:=false;
 BEGIN PERFORM cp_quote_marketplace_order_usd_v1(1,NULL,1,'EXPIRED',17706);
 EXCEPTION WHEN raise_exception THEN caught:=true; END;
 ASSERT caught;
 caught:=false;
 BEGIN PERFORM cp_quote_marketplace_order_usd_v1(2,NULL,1,NULL,17706);
 EXCEPTION WHEN raise_exception THEN caught:=true; END;
 ASSERT caught;

 q:=cp_quote_marketplace_order_usd_v1(1,NULL,1,NULL,17706);
 PERFORM set_config('test.fail_tax','true',true);
 caught:=false;
 BEGIN PERFORM cp_create_quoted_marketplace_order_v1(buyer,1,NULL,1,NULL,20,17706,q);
 EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='fixture tax failure'; END;
 ASSERT caught;
 ASSERT (SELECT count(*) FROM orders)=n AND (SELECT stock FROM products WHERE id=1)=stock_before, 'tax failure must roll back stock and order';
 ASSERT NOT has_function_privilege('anon','cp_quote_marketplace_order_usd_v1(bigint,bigint,integer,text,numeric)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','cp_create_quoted_marketplace_order_v1(uuid,bigint,bigint,integer,text,integer,numeric,jsonb)','EXECUTE');
 ASSERT has_function_privilege('service_role','cp_create_quoted_marketplace_order_v1(uuid,bigint,bigint,integer,text,integer,numeric,jsonb)','EXECUTE');
END $$;
ROLLBACK;
\echo Marketplace pricing and atomic checkout checks passed.
