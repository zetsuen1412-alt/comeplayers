-- ComePlayers Security Boundary V5 verification

SELECT proname
FROM pg_proc
WHERE proname IN (
  'cp_is_admin',
  'cp_admin_confirm_manual_payment',
  'cp_admin_finalize_order_refund',
  'cp_admin_override_order_status'
)
ORDER BY proname;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN (
    'refund_reason',
    'refund_reference',
    'refund_amount',
    'refunded_at',
    'refunded_by',
    'admin_note',
    'cancelled_at',
    'cancelled_by'
  )
ORDER BY column_name;

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'cp_%'
  AND tablename IN (
    'coupons',
    'flash_sales',
    'disputes',
    'support_tickets',
    'support_ticket_messages',
    'admin_audit_logs'
  )
ORDER BY tablename, policyname;

SELECT
  'comeplayers_security_boundary_v5_verified' AS status,
  (SELECT count(*) FROM public.admin_audit_logs) AS audit_log_count;
