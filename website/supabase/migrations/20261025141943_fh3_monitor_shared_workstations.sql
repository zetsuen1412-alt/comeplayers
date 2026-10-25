-- A shared workstation account operates FH3 workers without receiving admin or
-- website Payroll rights. Existing personal bindings retain their scope.
alter table public.cp_fh3_monitor_accounts
 add column access_scope text not null default 'employee',
 alter column employee_id drop not null,
 alter column employee_code drop not null,
 add constraint cp_monitor_account_scope check (
  (access_scope='employee' and employee_id is not null and employee_code is not null)
  or (access_scope='shared' and employee_id is null and employee_code is null)
 );

create or replace function public.cp_monitor_assert_actor(p_actor uuid,p_code text default null,p_admin boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.cp_fh3_monitor_accounts; target jsonb;
begin
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
 select e into target from public.cp_payroll_workspace w,
  lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  where w.id=1 and e->>'code'=p_code and e->>'team'='FH3'
   and e->>'workforceStatus' in ('NEW','SHIFT','FULL') and nullif(e->>'sheetRosterMissingAt','') is null;
 if target is null or (a.access_scope='employee' and target->>'id' is distinct from a.employee_id) then
  raise exception 'Akses Monitor ditolak.'; end if;
 if (select count(*) from public.cp_payroll_workspace w,
  lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  where w.id=1 and (e->>'code'=p_code or e->>'id'=target->>'id'))<>1 then
  raise exception 'Akses Monitor ditolak.'; end if;
end $$;
revoke all on function public.cp_monitor_assert_actor(uuid,text,boolean) from public,anon,authenticated,service_role;

create function public.cp_monitor_set_account_scope(p_actor uuid,p_user uuid,p_scope text,p_code text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare emp jsonb; old_account public.cp_fh3_monitor_accounts;
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);
 -- Same workspace lock used by operational claims: revocation is checked again
 -- inside TAKE/START/DONE transactions, even after an earlier API authorization.
 perform 1 from public.cp_payroll_workspace where id=1 for update;
 if not exists(select 1 from public.profiles where id=p_user and lower(btrim(role))<>'admin') then
  raise exception 'Akun karyawan tidak ditemukan atau merupakan admin.'; end if;
 if p_scope is null or p_scope not in ('employee','shared') or p_active is null then
  raise exception 'Jenis akses akun tidak valid.'; end if;
 select * into old_account from public.cp_fh3_monitor_accounts where user_id=p_user for update;
 if p_scope='employee' then
  select e into emp from public.cp_payroll_workspace w,
   lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
   where w.id=1 and e->>'code'=p_code and e->>'team'='FH3'
    and e->>'workforceStatus' in ('NEW','SHIFT','FULL') and nullif(e->>'sheetRosterMissingAt','') is null;
  if emp is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;
  if (select count(*) from public.cp_payroll_workspace w,lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
   where w.id=1 and (e->>'code'=p_code or e->>'id'=emp->>'id'))<>1 then raise exception 'Identitas karyawan ambigu.'; end if;
  if old_account.access_scope='employee' and (old_account.employee_id<>emp->>'id' or old_account.employee_code<>p_code) then
   raise exception 'Akun sudah terikat ke karyawan lain. Gunakan akun yang berbeda.'; end if;
 elsif nullif(btrim(p_code),'') is not null then raise exception 'Akun bersama tidak diikat ke satu karyawan.';
 end if;
 insert into public.cp_fh3_monitor_accounts(user_id,employee_id,employee_code,access_scope,active,updated_by)
 values(p_user,emp->>'id',emp->>'code',p_scope,p_active,p_actor) on conflict(user_id) do update
 set employee_id=excluded.employee_id,employee_code=excluded.employee_code,access_scope=excluded.access_scope,
  active=excluded.active,updated_by=p_actor,updated_at=clock_timestamp();
 insert into public.cp_fh3_monitor_audit(actor_id,action,reason,before_data,after_data)
 values(p_actor,'account','Pengaturan akses akun Monitor',to_jsonb(old_account),
  jsonb_build_object('userId',p_user,'employeeCode',emp->>'code','accessScope',p_scope,'active',p_active));
 return jsonb_build_object('ok',true,'accessScope',p_scope);
end $$;
revoke all on function public.cp_monitor_set_account_scope(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.cp_monitor_set_account_scope(uuid,uuid,text,text,boolean) to service_role;

-- Retain the existing single-employee RPC for older clients.
create or replace function public.cp_monitor_bind_account(p_actor uuid,p_user uuid,p_code text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 return public.cp_monitor_set_account_scope(p_actor,p_user,'employee',p_code,p_active);
end $$;
revoke all on function public.cp_monitor_bind_account(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.cp_monitor_bind_account(uuid,uuid,text,boolean) to service_role;

-- Shared accounts use independent Auth sessions, not the website's single
-- current-session slot. Still reject a removed/expired Auth session immediately.
create function public.cp_monitor_shared_session_active(p_actor uuid,p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from auth.sessions s join public.cp_fh3_monitor_accounts a on a.user_id=s.user_id
  join public.profiles p on p.id=a.user_id
  where s.id=p_session and s.user_id=p_actor and (s.not_after is null or s.not_after>now())
   and a.active and a.access_scope='shared' and lower(btrim(p.role))<>'admin'
 )
$$;
revoke all on function public.cp_monitor_shared_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cp_monitor_shared_session_active(uuid,uuid) to service_role;
