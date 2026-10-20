-- Refresh only missing, historically backed-up sheet orders after an admin reset.
-- The existing Apps Script will re-read original rows on its next scheduled sync.
-- Never restore stale records from backup into live mutations.
create or replace function public.cp_missing_payroll_reset_reimport_refs(
  p_namespace text,
  p_start_row integer
)
returns text[]
language sql
security definer
set search_path = ''
as $$
  with latest_backups as (
    select before_data
    from public.cp_payroll_mutation_resets
    order by created_at desc
    limit 2
  ), backup_refs as (
    select distinct lower(btrim(o->>'externalReference')) code
    from latest_backups b
    cross join lateral jsonb_array_elements(coalesce(b.before_data->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) o
    where p_namespace = '1dcw71cfqrJnLUOd27bcDlP5EhFqer1xL6OnWuojbRMQ'
      and p_start_row = 5848
      and left(o->>'id',length('gsheet:'||p_namespace||':MUTASI_FH:')) = 'gsheet:'||p_namespace||':MUTASI_FH:'
      and (o->>'importSourceRow') ~ '^[0-9]{1,6}$'
      and (o->>'importSourceRow')::integer >= p_start_row
      and length(btrim(o->>'externalReference')) between 1 and 160
  ), active_refs as (
    select lower(btrim(o->>'externalReference')) code
    from public.cp_payroll_workspace w
    cross join lateral jsonb_array_elements(coalesce(w.payload->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) o
    where w.id=1
  )
  select coalesce(array_agg(code order by code),array[]::text[])
  from (
    select b.code from backup_refs b
    where not exists (select 1 from active_refs a where a.code=b.code)
    order by b.code
    limit 3000
  ) missing;
$$;
revoke all on function public.cp_missing_payroll_reset_reimport_refs(text,integer) from public, anon, authenticated;
grant execute on function public.cp_missing_payroll_reset_reimport_refs(text,integer) to service_role;
