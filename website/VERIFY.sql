-- Verify Security Boundary V4 installation.

select to_regclass('public.admin_audit_logs') as admin_audit_logs_table;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'cp_admin_process_wallet_topup',
    'cp_admin_process_withdrawal'
  )
order by p.proname;

select id, admin_id, action, entity_type, entity_id, created_at
from public.admin_audit_logs
order by id desc
limit 20;
