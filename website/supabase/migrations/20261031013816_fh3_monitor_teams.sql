-- Add an operational team without changing the existing order-level Telegram lifecycle.
-- Existing jobs and historical Closing rows retain their original identities and amounts.
create table public.cp_fh3_monitor_teams (
 order_ref text primary key references public.cp_fh3_telegram_manual_orders(order_ref),
 version bigint not null default 0 check(version>=0),
 primary_employee_code text not null,
 updated_by uuid not null, updated_at timestamptz not null default clock_timestamp()
);
create table public.cp_fh3_monitor_team_members (
 order_ref text not null references public.cp_fh3_monitor_teams(order_ref),
 employee_id text not null, employee_code text not null, employee_name text not null,
 share_bps integer not null check(share_bps between 1 and 10000),
 joined_at timestamptz not null default clock_timestamp(),
 primary key(order_ref,employee_code), unique(order_ref,employee_id)
);
create index cp_fh3_monitor_team_worker on public.cp_fh3_monitor_team_members(employee_id,order_ref);
-- An additive per-recipient snapshot; closing_items remains the once-per-order seal.
create table public.cp_fh3_monitor_closing_shares (
 order_ref text not null references public.cp_fh3_monitor_closing_items(order_ref),
 closing_id uuid not null references public.cp_fh3_monitor_closings(id),
 employee_id text not null, employee_code text not null, employee_name text not null,
 share_bps integer not null check(share_bps between 1 and 10000),
 wage_rupiah bigint not null check(wage_rupiah>=0), joined_at timestamptz not null,
 team_version bigint not null check(team_version>0),
 primary key(order_ref,employee_id), unique(order_ref,employee_code)
);
create index cp_fh3_monitor_closing_share_worker on public.cp_fh3_monitor_closing_shares(employee_id,closing_id);
alter table public.cp_fh3_monitor_teams enable row level security;
alter table public.cp_fh3_monitor_team_members enable row level security;
alter table public.cp_fh3_monitor_closing_shares enable row level security;
revoke all on public.cp_fh3_monitor_teams,public.cp_fh3_monitor_team_members,public.cp_fh3_monitor_closing_shares
 from public,anon,authenticated,service_role;
grant select on public.cp_fh3_monitor_teams,public.cp_fh3_monitor_team_members,public.cp_fh3_monitor_closing_shares to service_role;

create function public.cp_monitor_team_snapshot(p_order_ref text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare ref text:=upper(btrim(p_order_ref)); head public.cp_fh3_monitor_teams;
 members jsonb; lead_code text; lead_id text; lead_name text; joined timestamptz; matches integer;
begin
 if ref is null or ref !~ '^X[0-9]{2,12}$' then raise exception 'Kode order tidak valid.'; end if;
 select * into head from public.cp_fh3_monitor_teams where order_ref=ref;
 if head.order_ref is not null then
  select jsonb_agg(jsonb_build_object('employeeId',employee_id,'employeeCode',employee_code,
   'employeeName',employee_name,'shareBps',share_bps,'joinedAt',joined_at)
   order by case when employee_code=head.primary_employee_code then 0 else 1 end,employee_code collate "C")
  into members from public.cp_fh3_monitor_team_members where order_ref=ref;
  return jsonb_build_object('orderRef',ref,'teamVersion',head.version,'primaryEmployeeCode',head.primary_employee_code,
   'participants',coalesce(members,'[]'::jsonb));
 end if;
 select employee_id,employee_code,employee_name,created_at into lead_id,lead_code,lead_name,joined
 from public.cp_fh3_monitor_jobs where order_ref=ref;
 if lead_code is null then
  select count(*),min(coalesce(o->'workerAssignments'->0->>'employeeCode',o->>'employeeCode')) into matches,lead_code
  from public.cp_payroll_workspace w,lateral jsonb_array_elements(coalesce(w.payload->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) o
  where w.id=1 and upper(btrim(o->>'externalReference'))=ref
   and coalesce(jsonb_array_length(o->'workerAssignments'),0)<=1;
  if matches<>1 then lead_code:=null; end if;
  select e->>'id',e->>'name' into lead_id,lead_name from public.cp_payroll_workspace w,
   lateral jsonb_array_elements(coalesce(w.payload->'cp-ofs-demo-employees-v2','[]'::jsonb)) e
   where w.id=1 and e->>'code'=lead_code and e->>'team'='FH3';
 end if;
 return jsonb_build_object('orderRef',ref,'teamVersion',0,'primaryEmployeeCode',coalesce(lead_code,''),
  'participants',case when lead_id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
   'employeeId',lead_id,'employeeCode',lead_code,'employeeName',lead_name,'shareBps',10000,'joinedAt',joined)) end);
end $$;

create function public.cp_monitor_team_states(p_refs text[] default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if coalesce(cardinality(p_refs),0)>15000 then raise exception 'Terlalu banyak referensi tim.'; end if;
 select jsonb_agg(public.cp_monitor_team_snapshot(t.order_ref) order by t.order_ref) into result
 from public.cp_fh3_monitor_teams t where p_refs is null or t.order_ref=any(p_refs);
 return coalesce(result,'[]'::jsonb);
end $$;

create function public.cp_monitor_set_team(p_order_ref text,p_expected_version bigint,p_participants jsonb,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ref text:=upper(btrim(p_order_ref)); before_team jsonb; after_team jsonb; head public.cp_fh3_monitor_teams;
 item jsonb; emp jsonb; lead text; n integer; total integer; member_code text; old_member public.cp_fh3_monitor_team_members;
begin
 perform public.cp_monitor_assert_actor(p_actor_user_id,null,true);
 perform public.cp_monitor_lock_order(ref);
 if ref is null or ref !~ '^X[0-9]{2,12}$' or p_expected_version is null or p_expected_version<0 then
  raise exception 'Referensi atau versi tim tidak valid.'; end if;
 if jsonb_typeof(p_participants) is distinct from 'array' then raise exception 'Daftar karyawan tidak valid.'; end if;
 n:=jsonb_array_length(p_participants);
 if n not between 1 and 4 then raise exception 'Pilih 1 sampai 4 karyawan.'; end if;
 total:=0;
 for item in select value from jsonb_array_elements(p_participants) loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'employeeCode') is distinct from 'string'
   or nullif(btrim(item->>'employeeCode'),'') is null or length(item->>'employeeCode')>100
   or jsonb_typeof(item->'shareBps') is distinct from 'number' or (item->>'shareBps') !~ '^[0-9]{1,5}$'
   or (item->>'shareBps')::integer not between 1 and 10000 then
   raise exception 'Bagian tiap karyawan harus lebih dari 0 hingga 100 persen dengan maksimal 2 desimal.'; end if;
  total:=total+(item->>'shareBps')::integer;
 end loop;
 if total<>10000 or (select count(distinct value->>'employeeCode') from jsonb_array_elements(p_participants))<>n then
  raise exception 'Karyawan tidak boleh berulang dan total bagian harus 100 persen.'; end if;
 if not exists(select 1 from public.cp_fh3_telegram_manual_orders where order_ref=ref and active)
  or exists(select 1 from public.cp_fh3_monitor_controls where order_ref=ref and (archived or state<>'normal')) then
  raise exception 'Order tidak aktif, diarsipkan, Refund, atau Bermasalah.'; end if;
 if exists(select 1 from public.cp_fh3_monitor_closing_items where order_ref=ref)
  or exists(select 1 from public.cp_fh3_monitor_jobs where order_ref=ref and status='completed')
  or exists(select 1 from public.cp_mobile_order_proof where order_ref=ref and action='done' and status='sent') then
  raise exception 'Order sudah selesai atau Tutup Buku; tim tidak dapat diubah.'; end if;
 if not exists(select 1 from public.cp_fh3_monitor_jobs where order_ref=ref) and exists(
  select 1 from public.cp_payroll_workspace w,lateral jsonb_array_elements(coalesce(w.payload->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) o
  where w.id=1 and upper(btrim(o->>'externalReference'))=ref and (
   coalesce(o->>'operationalStatus','') not in ('assigned','in_progress','on_hold')
   or nullif(o->>'completedAt','') is not null or nullif(o->>'verifiedAt','') is not null
   or nullif(o->>'payrollClosedAt','') is not null or nullif(o->>'payrollPeriodId','') is not null
   or o->>'financeStatus'='closed')) then
  raise exception 'Order Payroll sudah selesai atau tidak dapat dikerjakan.'; end if;
 if exists(select 1 from public.cp_mobile_order_take where order_ref=ref and status in ('sending','unknown'))
  or exists(select 1 from public.cp_mobile_order_proof where order_ref=ref and status in ('sending','unknown'))
  or exists(select 1 from public.cp_monitor_pause_events where order_ref=ref and status in ('sending','unknown'))
  or exists(select 1 from public.cp_monitor_daily_events where order_ref=ref and status in ('sending','unknown')) then
  raise exception 'Laporan Telegram belum pasti. Rekonsiliasi sebelum mengubah tim.'; end if;
 before_team:=public.cp_monitor_team_snapshot(ref);
 lead:=before_team->>'primaryEmployeeCode';
 if nullif(lead,'') is null then raise exception 'TAKE order terlebih dahulu sebelum mengatur tim.'; end if;
 if not exists(select 1 from jsonb_array_elements(p_participants) p where p->>'employeeCode'=lead) then
  raise exception 'Karyawan awal harus tetap berada dalam tim.'; end if;
 insert into public.cp_fh3_monitor_teams(order_ref,primary_employee_code,updated_by) values(ref,lead,p_actor_user_id) on conflict do nothing;
 select * into head from public.cp_fh3_monitor_teams where order_ref=ref for update;
 if head.version<>p_expected_version or head.primary_employee_code<>lead then raise exception 'Tim berubah. Muat ulang sebelum menyimpan.'; end if;
 if exists(select 1 from public.cp_fh3_monitor_team_members m where m.order_ref=ref and not exists(
  select 1 from jsonb_array_elements(p_participants) p where p->>'employeeCode'=m.employee_code)) then
  raise exception 'Karyawan yang sudah bergabung tidak dapat dihapus.'; end if;
 for item in select value from jsonb_array_elements(p_participants) loop
  member_code:=item->>'employeeCode';
  select e into emp from public.cp_payroll_workspace w,lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
   where w.id=1 and e->>'code'=member_code and e->>'team'='FH3' and e->>'workforceStatus' in ('NEW','SHIFT','FULL')
    and nullif(e->>'sheetRosterMissingAt','') is null;
  if emp is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;
  if (select count(*) from public.cp_payroll_workspace w,lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
   where w.id=1 and (e->>'code'=member_code or e->>'id'=emp->>'id'))<>1 then raise exception 'Identitas karyawan ambigu.'; end if;
  select * into old_member from public.cp_fh3_monitor_team_members where order_ref=ref and employee_code=member_code;
  if old_member.employee_id is not null and old_member.employee_id<>emp->>'id' then raise exception 'Identitas anggota tim berubah.'; end if;
  insert into public.cp_fh3_monitor_team_members(order_ref,employee_id,employee_code,employee_name,share_bps,joined_at)
   values(ref,emp->>'id',member_code,emp->>'name',(item->>'shareBps')::integer,
    case when member_code=lead then coalesce((before_team->'participants'->0->>'joinedAt')::timestamptz,clock_timestamp()) else clock_timestamp() end)
  on conflict(order_ref,employee_code) do update set share_bps=excluded.share_bps,employee_name=excluded.employee_name;
 end loop;
 update public.cp_fh3_monitor_teams set version=version+1,updated_by=p_actor_user_id,updated_at=clock_timestamp() where order_ref=ref;
 -- Closing review versions cover both the price and allocation.
 insert into public.cp_fh3_monitor_controls(order_ref,version) values(ref,1)
 on conflict(order_ref) do update set version=cp_fh3_monitor_controls.version+1,updated_at=clock_timestamp();
 after_team:=public.cp_monitor_team_snapshot(ref);
 insert into public.cp_fh3_monitor_audit(actor_id,order_ref,action,reason,before_data,after_data)
 values(p_actor_user_id,ref,'team','Pembagian hasil tim oleh admin',before_team,after_team);
 return after_team||jsonb_build_object('ok',true);
end $$;

create function public.cp_monitor_assign_team(p_order_ref text,p_expected_version bigint,p_participants jsonb,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare assigned jsonb; team jsonb;
begin
 perform public.cp_monitor_assert_actor(p_actor_user_id,null,true);
 if jsonb_typeof(p_participants) is distinct from 'array' or jsonb_array_length(p_participants) not between 1 and 4 then
  raise exception 'Pilih 1 sampai 4 karyawan.'; end if;
 assigned:=public.cp_mobile_assign_fh3(p_order_ref,p_participants->0->>'employeeCode',p_actor_user_id);
 team:=public.cp_monitor_set_team(p_order_ref,p_expected_version,p_participants,p_actor_user_id);
 return assigned||team;
end $$;

-- Retain all participating identities across Payroll roster refreshes.
create function public.cp_monitor_preserve_team_employees() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.cp_fh3_monitor_team_members m where not exists(
  select 1 from jsonb_array_elements(coalesce(new.payload->'cp-ofs-demo-employees-v2','[]'::jsonb)) e
  where e->>'id'=m.employee_id and e->>'code'=m.employee_code)) then
  raise exception 'Identitas karyawan memiliki riwayat tim Monitor dan harus dipertahankan.'; end if;
 return new;
end $$;
create trigger cp_fh3_monitor_team_employee_guard before update of payload on public.cp_payroll_workspace
 for each row execute function public.cp_monitor_preserve_team_employees();

-- Legacy transfer resets evidence and assigns one beneficiary; explicit teams cannot use it.
alter function public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text) rename to cp_monitor_manage_before_team;
create function public.cp_monitor_manage_order(p_actor uuid,p_ref text,p_version bigint,p_action text,
 p_reason text,p_state text default null,p_wage bigint default null,p_employee text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);
 perform public.cp_monitor_lock_order(upper(btrim(p_ref)));
 if p_action='transfer' and exists(select 1 from public.cp_fh3_monitor_teams where order_ref=upper(btrim(p_ref))) then
  raise exception 'Order tim tidak dapat dipindahkan. Atur karyawan dan persentase melalui Kelola Tim.'; end if;
 return public.cp_monitor_manage_before_team(p_actor,p_ref,p_version,p_action,p_reason,p_state,p_wage,p_employee);
end $$;

alter function public.cp_monitor_close_book(uuid,uuid,text,jsonb) rename to cp_monitor_close_before_team;
create function public.cp_monitor_close_book(p_actor uuid,p_id uuid,p_title text,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- The existing function locks the workspace, validates exact reviewed versions,
 -- and seals one immutable row per order. Allocation is committed in this transaction.
 result:=public.cp_monitor_close_before_team(p_actor,p_id,p_title,p_expected);
 if coalesce((result->>'alreadyClosed')::boolean,false) then return result; end if;
 if exists(select 1 from public.cp_fh3_monitor_closing_items i join public.cp_fh3_monitor_teams t using(order_ref)
  where i.closing_id=p_id and ((select count(*) from public.cp_fh3_monitor_team_members m where m.order_ref=i.order_ref) not between 1 and 4
   or (select sum(share_bps) from public.cp_fh3_monitor_team_members m where m.order_ref=i.order_ref)<>10000)) then
  raise exception 'Pembagian tim tidak lengkap. Tutup Buku dibatalkan.'; end if;
 insert into public.cp_fh3_monitor_closing_shares(order_ref,closing_id,employee_id,employee_code,employee_name,share_bps,wage_rupiah,joined_at,team_version)
 select order_ref,closing_id,employee_id,employee_code,employee_name,share_bps,
  base_wage+case when seq<=order_wage-sum(base_wage) over(partition by order_ref) then 1 else 0 end,joined_at,version
 from (
  select i.order_ref,i.closing_id,m.employee_id,m.employee_code,m.employee_name,m.share_bps,m.joined_at,t.version,
   i.wage_rupiah order_wage,(i.wage_rupiah*m.share_bps/10000)::bigint base_wage,
   row_number() over(partition by i.order_ref order by m.employee_code collate "C") seq
  from public.cp_fh3_monitor_closing_items i join public.cp_fh3_monitor_teams t using(order_ref)
   join public.cp_fh3_monitor_team_members m using(order_ref) where i.closing_id=p_id
 ) shares;
 return result;
end $$;

revoke all on function public.cp_monitor_team_snapshot(text),public.cp_monitor_team_states(text[]),
 public.cp_monitor_set_team(text,bigint,jsonb,uuid),public.cp_monitor_assign_team(text,bigint,jsonb,uuid),
 public.cp_monitor_preserve_team_employees(),public.cp_monitor_manage_before_team(uuid,text,bigint,text,text,text,bigint,text),
 public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text),
 public.cp_monitor_close_before_team(uuid,uuid,text,jsonb),public.cp_monitor_close_book(uuid,uuid,text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.cp_monitor_team_snapshot(text),public.cp_monitor_team_states(text[]),
 public.cp_monitor_set_team(text,bigint,jsonb,uuid),public.cp_monitor_assign_team(text,bigint,jsonb,uuid),
 public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text),public.cp_monitor_close_book(uuid,uuid,text,jsonb) to service_role;
