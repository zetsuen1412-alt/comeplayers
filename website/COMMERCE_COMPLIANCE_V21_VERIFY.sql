SELECT to_regclass('public.user_billing_profiles') AS user_billing_profiles;
SELECT to_regclass('public.tax_rates') AS tax_rates;
SELECT to_regclass('public.order_tax_snapshots') AS order_tax_snapshots;
SELECT to_regclass('public.order_invoices') AS order_invoices;
SELECT to_regclass('public.prohibited_product_rules') AS prohibited_product_rules;
SELECT to_regclass('public.product_policy_reviews') AS product_policy_reviews;
SELECT to_regclass('public.privacy_requests') AS privacy_requests;
SELECT to_regclass('public.provider_settlement_reports') AS provider_settlement_reports;
SELECT to_regclass('public.risk_feedback_events') AS risk_feedback_events;
SELECT proname FROM pg_proc WHERE proname = 'cp_apply_order_tax_v21';
SELECT area, status FROM public.launch_signoffs
WHERE area IN ('tax_configuration','product_policy','privacy_operations','provider_settlement')
ORDER BY area;
