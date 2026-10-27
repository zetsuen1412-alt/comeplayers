-- Derived operational data only. Payroll, wage and Closing source rows are untouched.
-- Rebuild once when the source workspace changes, rather than on every device poll.
create schema if not exists cp_monitor_private;
revoke all on schema cp_monitor_private from public, anon, authenticated, service_role;

create table cp_monitor_private.workspace_projection (
 id integer primary key check(id=1),
 roster jsonb not null,
 operations jsonb not null
);
alter table cp_monitor_private.workspace_projection enable row level security;
revoke all on cp_monitor_private.workspace_projection from public, anon, authenticated, service_role;

create function cp_monitor_private.project_workspace(p_payload jsonb, p_revision bigint, p_updated_at timestamptz, p_orders boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('revision',p_revision,'updated_at',p_updated_at,
  'payload',jsonb_build_object('cp-ofs-demo-employees-v2',coalesce((
   select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',e->'id','code',e->'code','name',e->'name','team',e->'team',
    'workforceStatus',e->'workforceStatus','sheetRosterMissingAt',e->'sheetRosterMissingAt'
   ))) from jsonb_array_elements(p_payload->'cp-ofs-demo-employees-v2') e
  ),'[]'::jsonb)) || case when p_orders then jsonb_build_object('cp-ofs-demo-user-orders-v3',coalesce((
   select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',o->'id','externalReference',o->'externalReference','team',o->'team',
    'orderType',o->'orderType','operationalStatus',o->'operationalStatus',
    'importNeedsReview',o->'importNeedsReview','sheetDeletedAt',o->'sheetDeletedAt','websiteDeletedAt',o->'websiteDeletedAt',
    'verifiedAt',o->'verifiedAt','completedAt',o->'completedAt','payrollClosedAt',o->'payrollClosedAt',
    'payrollPeriodId',o->'payrollPeriodId','financeStatus',o->'financeStatus','scheduleMode',o->'scheduleMode',
    'workerAssignments',o->'workerAssignments','employeeCode',o->'employeeCode','employeeName',o->'employeeName',
    'quantity',o->'quantity','orderedAt',o->'orderedAt','process',o->'process','service',o->'service'
   ))) from jsonb_array_elements(p_payload->'cp-ofs-demo-user-orders-v3') o
  ),'[]'::jsonb)) else '{}'::jsonb end
 );
$$;
revoke all on function cp_monitor_private.project_workspace(jsonb,bigint,timestamptz,boolean) from public,anon,authenticated,service_role;

create function cp_monitor_private.refresh_workspace_projection()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='TRUNCATE' then
  delete from cp_monitor_private.workspace_projection;
  return null;
 end if;
 if TG_OP='DELETE' then
  delete from cp_monitor_private.workspace_projection where id=old.id;
  return old;
 end if;
 if TG_OP='UPDATE' and old.id is distinct from new.id then
  delete from cp_monitor_private.workspace_projection where id=old.id;
 end if;
 if new.id=1 then
  insert into cp_monitor_private.workspace_projection(id,roster,operations)
  values(1,
   cp_monitor_private.project_workspace(new.payload,new.revision,new.updated_at,false),
   cp_monitor_private.project_workspace(new.payload,new.revision,new.updated_at,true))
  on conflict(id) do update set roster=excluded.roster,operations=excluded.operations;
 end if;
 return new;
end $$;
revoke all on function cp_monitor_private.refresh_workspace_projection() from public,anon,authenticated,service_role;

create trigger cp_monitor_workspace_projection_insert_delete
 after insert or delete on public.cp_payroll_workspace
 for each row execute function cp_monitor_private.refresh_workspace_projection();
create trigger cp_monitor_workspace_projection_update
 after update of id,payload,revision,updated_at on public.cp_payroll_workspace
 for each row when(old.id is distinct from new.id or old.payload is distinct from new.payload or old.revision is distinct from new.revision or old.updated_at is distinct from new.updated_at)
 execute function cp_monitor_private.refresh_workspace_projection();
create trigger cp_monitor_workspace_projection_truncate
 after truncate on public.cp_payroll_workspace
 for each statement execute function cp_monitor_private.refresh_workspace_projection();

-- Backfill the derived table without UPDATE-ing Payroll or creating audit snapshots.
insert into cp_monitor_private.workspace_projection(id,roster,operations)
select id,
 cp_monitor_private.project_workspace(payload,revision,updated_at,false),
 cp_monitor_private.project_workspace(payload,revision,updated_at,true)
from public.cp_payroll_workspace where id=1;

create or replace function public.cp_monitor_workspace_snapshot(p_orders boolean default true)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when p_orders then operations else roster end
 from cp_monitor_private.workspace_projection where id=1;
$$;
revoke all on function public.cp_monitor_workspace_snapshot(boolean) from public,anon,authenticated,service_role;
grant execute on function public.cp_monitor_workspace_snapshot(boolean) to service_role;
