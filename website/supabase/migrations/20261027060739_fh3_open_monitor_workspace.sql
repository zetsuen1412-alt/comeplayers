-- Owner-requested open worker mode: no account, activation or secret embedded in apps.
-- Only server service_role RPCs may use its non-admin audit principal.
create table public.cp_monitor_open_mode (
 id integer primary key check(id=1), enabled boolean not null default true
);
insert into public.cp_monitor_open_mode(id,enabled) values(1,true);
create table public.cp_monitor_open_limits (
 key text not null check(key ~ '^[a-f0-9]{64}$'),
 writing boolean not null, bucket timestamptz not null, requests integer not null,
 primary key(key,writing)
);
create index cp_monitor_open_limit_expiry on public.cp_monitor_open_limits(bucket);
alter table public.cp_monitor_open_mode enable row level security;
alter table public.cp_monitor_open_limits enable row level security;
revoke all on public.cp_monitor_open_mode,public.cp_monitor_open_limits from public,anon,authenticated,service_role;

-- Never return the multi-megabyte Payroll/Closing document for roster validation.
-- Preserve ALL employee IDs/codes and ALL order references so ambiguity checks
-- still detect collisions across teams and old/completed records.
create function public.cp_monitor_workspace_snapshot(p_orders boolean default true)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',w.revision,'updated_at',w.updated_at,
  'payload',jsonb_build_object('cp-ofs-demo-employees-v2',coalesce((
   select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',e->'id','code',e->'code','name',e->'name','team',e->'team',
    'workforceStatus',e->'workforceStatus','sheetRosterMissingAt',e->'sheetRosterMissingAt'
   ))) from jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  ),'[]'::jsonb)) || case when p_orders then jsonb_build_object('cp-ofs-demo-user-orders-v3',coalesce((
   select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',o->'id','externalReference',o->'externalReference','team',o->'team',
    'orderType',o->'orderType','operationalStatus',o->'operationalStatus',
    'importNeedsReview',o->'importNeedsReview','sheetDeletedAt',o->'sheetDeletedAt','websiteDeletedAt',o->'websiteDeletedAt',
    'verifiedAt',o->'verifiedAt','completedAt',o->'completedAt','payrollClosedAt',o->'payrollClosedAt',
    'payrollPeriodId',o->'payrollPeriodId','financeStatus',o->'financeStatus','scheduleMode',o->'scheduleMode',
    'workerAssignments',o->'workerAssignments','employeeCode',o->'employeeCode','employeeName',o->'employeeName',
    'quantity',o->'quantity','orderedAt',o->'orderedAt','process',o->'process','service',o->'service'
   ))) from jsonb_array_elements(w.payload->'cp-ofs-demo-user-orders-v3') o
  ),'[]'::jsonb)) else '{}'::jsonb end
 ) from public.cp_payroll_workspace w where w.id=1;
$$;
revoke all on function public.cp_monitor_workspace_snapshot(boolean) from public,anon,authenticated,service_role;
grant execute on function public.cp_monitor_workspace_snapshot(boolean) to service_role;

create function public.cp_monitor_public_context(p_key text,p_write boolean,p_orders boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer; moment timestamptz:=date_trunc('minute',now());
begin
 if not exists(select 1 from public.cp_monitor_open_mode where id=1 and enabled) then
  return jsonb_build_object('enabled',false);
 end if;
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_write is null or p_orders is null then
  raise exception 'Permintaan Monitor tidak valid.';
 end if;
 delete from public.cp_monitor_open_limits where bucket<now()-interval '20 minutes';
 insert into public.cp_monitor_open_limits(key,writing,bucket,requests) values(p_key,p_write,moment,1)
 on conflict(key,writing) do update set
  requests=case when cp_monitor_open_limits.bucket=moment then cp_monitor_open_limits.requests+1 else 1 end,
  bucket=moment returning requests into n;
 -- Supports many workstations behind one office NAT; per-order state guards
 -- additionally prevent duplicate TAKE/photo reports, including uncertain sends.
 if n>(case when p_write then 100 else 1000 end) then raise exception 'Terlalu banyak permintaan Monitor.'; end if;
 return jsonb_build_object('enabled',true,'snapshot',public.cp_monitor_workspace_snapshot(p_orders));
end $$;
revoke all on function public.cp_monitor_public_context(text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cp_monitor_public_context(text,boolean,boolean) to service_role;

-- Existing private-account/MFA logic remains intact. Public operations use a
-- distinct actor with no profiles/auth.users account and can NEVER be admin.
create or replace function public.cp_monitor_assert_actor(p_actor uuid,p_code text default null,p_admin boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare target jsonb; a public.cp_fh3_monitor_accounts;
begin
 if p_actor = '00000000-0000-4000-8000-0000000000f3'::uuid then
  if p_admin or not exists(select 1 from public.cp_monitor_open_mode where id=1 and enabled) then
   raise exception 'Khusus admin Monitor.';
  end if;
  if p_code is null then return; end if;
 else
  if exists(select 1 from public.profiles where id=p_actor and lower(btrim(role))='admin') then return; end if;
  if p_admin then raise exception 'Akses Monitor ditolak.'; end if;
  select * into a from public.cp_fh3_monitor_accounts where user_id=p_actor and active;
  if not found then raise exception 'Akses Monitor ditolak.'; end if;
  if a.access_scope='shared' then
   if a.employee_id is not null or a.employee_code is not null then raise exception 'Akses Monitor ditolak.'; end if;
   if p_code is null then return; end if;
  elsif a.access_scope='employee' then
   if p_code is not null and p_code is distinct from a.employee_code then raise exception 'Akses Monitor ditolak.'; end if;
   p_code:=a.employee_code;
  else raise exception 'Akses Monitor ditolak.';
  end if;
 end if;
 select e into target from public.cp_payroll_workspace w,
  lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  where w.id=1 and e->>'code'=p_code and e->>'team'='FH3'
   and e->>'workforceStatus' in ('NEW','SHIFT','FULL') and nullif(e->>'sheetRosterMissingAt','') is null;
 if target is null or (a.access_scope='employee' and target->>'id' is distinct from a.employee_id)
  or (select count(*) from public.cp_payroll_workspace w,
  lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  where w.id=1 and (e->>'code'=p_code or e->>'id'=target->>'id'))<>1 then
  raise exception 'Karyawan FH3 tidak tersedia.';
 end if;
end $$;
revoke all on function public.cp_monitor_assert_actor(uuid,text,boolean) from public,anon,authenticated,service_role;

-- Emergency switch is admin-only; an open worker cannot disable or enable it.
create function public.cp_monitor_set_open_mode(p_actor uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);
 if p_enabled is null then raise exception 'Status tidak valid.'; end if;
 update public.cp_monitor_open_mode set enabled=p_enabled where id=1;
 return p_enabled;
end $$;
revoke all on function public.cp_monitor_set_open_mode(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cp_monitor_set_open_mode(uuid,boolean) to service_role;
