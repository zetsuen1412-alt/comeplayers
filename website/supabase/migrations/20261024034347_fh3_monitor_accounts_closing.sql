-- Monitor is a separate operational ledger. Never edit Payroll salaries or Closing.
create table public.cp_fh3_monitor_accounts (
 user_id uuid primary key references public.profiles(id), employee_id text not null unique,
 employee_code text not null unique, active boolean not null default true,
 updated_by uuid not null, updated_at timestamptz not null default now()
);
create table public.cp_fh3_monitor_controls (
 order_ref text primary key references public.cp_fh3_telegram_manual_orders(order_ref),
 state text not null default 'normal' check(state in ('normal','refund','problem')),
 archived boolean not null default false, wage_rupiah bigint check(wage_rupiah between 0 and 1000000000),
 beneficiary_id text, beneficiary_code text, beneficiary_name text,
 version bigint not null default 0, updated_at timestamptz not null default now()
);
create table public.cp_fh3_monitor_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,
 order_ref text, action text not null, reason text not null, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
create index cp_fh3_monitor_audit_order on public.cp_fh3_monitor_audit(order_ref,created_at desc);
create table public.cp_fh3_monitor_closings (
 id uuid primary key, actor_id uuid not null, title text not null,
 total_rupiah bigint not null check(total_rupiah>=0), order_count integer not null check(order_count>0),
 created_at timestamptz not null default now()
);
create table public.cp_fh3_monitor_closing_items (
 order_ref text primary key references public.cp_fh3_telegram_manual_orders(order_ref),
 closing_id uuid not null references public.cp_fh3_monitor_closings(id),
 employee_id text not null, employee_code text not null, employee_name text not null,
 wage_rupiah bigint not null check(wage_rupiah>=0), completed_at timestamptz not null,
 game text not null, discord text not null, task text not null
);
create index cp_fh3_monitor_closing_worker on public.cp_fh3_monitor_closing_items(employee_id,closing_id);
create table public.cp_fh3_monitor_login_limits (
 key text primary key, bucket timestamptz not null, attempts integer not null
);
create index cp_fh3_monitor_login_expiry on public.cp_fh3_monitor_login_limits(bucket);
-- Explicitly remove inherited default grants, including DELETE/TRUNCATE.
do $$ declare t text; begin
 foreach t in array array['accounts','controls','audit','closings','closing_items','login_limits'] loop
  execute format('alter table public.cp_fh3_monitor_%I enable row level security',t);
  execute format('revoke all on public.cp_fh3_monitor_%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
grant select on public.cp_fh3_monitor_accounts,public.cp_fh3_monitor_controls,
 public.cp_fh3_monitor_closings,public.cp_fh3_monitor_closing_items to service_role;

create function public.cp_monitor_assert_actor(p_actor uuid,p_code text default null,p_admin boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.profiles where id=p_actor and lower(btrim(role))='admin') then return; end if;
 if p_admin or not exists(select 1 from public.cp_fh3_monitor_accounts a
  cross join public.cp_payroll_workspace w
  cross join lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  where a.user_id=p_actor and a.active and w.id=1 and e->>'id'=a.employee_id and e->>'code'=a.employee_code
   and e->>'team'='FH3' and e->>'workforceStatus' in ('NEW','SHIFT','FULL')
   and nullif(e->>'sheetRosterMissingAt','') is null
   and (p_code is null or p_code=a.employee_code)) then raise exception 'Akses Monitor ditolak.'; end if;
end $$;
revoke all on function public.cp_monitor_assert_actor(uuid,text,boolean) from public,anon,authenticated,service_role;

create function public.cp_monitor_bind_account(p_actor uuid,p_user uuid,p_code text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare emp jsonb;
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);
 perform 1 from public.cp_payroll_workspace where id=1 for update;
 if not exists(select 1 from public.profiles where id=p_user and lower(btrim(role))<>'admin') then
  raise exception 'Akun karyawan tidak ditemukan atau merupakan admin.'; end if;
 select e into emp from public.cp_payroll_workspace w,
  lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  where w.id=1 and e->>'code'=p_code and e->>'team'='FH3'
   and e->>'workforceStatus' in ('NEW','SHIFT','FULL') and nullif(e->>'sheetRosterMissingAt','') is null;
 if emp is null or p_active is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;
 if exists(select 1 from public.cp_fh3_monitor_accounts where user_id=p_user
   and (employee_id<>emp->>'id' or employee_code<>p_code)) then
  raise exception 'Akun sudah terikat ke karyawan lain. Gunakan akun yang berbeda.'; end if;
 insert into public.cp_fh3_monitor_accounts(user_id,employee_id,employee_code,active,updated_by)
 values(p_user,emp->>'id',p_code,p_active,p_actor) on conflict(user_id) do update
 set active=excluded.active,updated_by=p_actor,updated_at=now();
 insert into public.cp_fh3_monitor_audit(actor_id,action,reason,after_data)
 values(p_actor,'account','Pengaturan akun karyawan',jsonb_build_object('userId',p_user,'employeeCode',p_code,'active',p_active));
 return jsonb_build_object('ok',true);
end $$;

-- Serializes all operations with the existing intake/workspace lock order.
create function public.cp_monitor_lock_order(p_ref text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.cp_payroll_telegram_divisions d
 join public.cp_fh3_telegram_manual_orders r on r.chat_id=d.chat_id and r.admin_user_id=d.fh3_order_sender_id
 where d.division='FH3' and d.active and r.order_ref=p_ref for share of d,r;
 if not found then raise exception 'Sumber order Telegram tidak valid.'; end if;
 perform 1 from public.cp_payroll_workspace where id=1 for update;
end $$;
revoke all on function public.cp_monitor_lock_order(text) from public,anon,authenticated,service_role;

create function public.cp_monitor_operation_guard(p_ref text,p_code text,p_actor uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform public.cp_monitor_lock_order(upper(btrim(p_ref)));
 perform public.cp_monitor_assert_actor(p_actor,p_code,false);
 if exists(select 1 from public.cp_fh3_monitor_controls where order_ref=upper(btrim(p_ref))
  and (archived or state<>'normal')) then raise exception 'Order diarsipkan, Refund, atau Bermasalah.'; end if;
end $$;
revoke all on function public.cp_monitor_operation_guard(text,text,uuid) from public,anon,authenticated,service_role;
alter function public.cp_mobile_assign_fh3(text,text,uuid) rename to cp_mobile_assign_before_accounts;
alter function public.cp_mobile_take_begin(text,text,uuid) rename to cp_mobile_take_before_accounts;
alter function public.cp_mobile_proof_begin(text,text,text,uuid) rename to cp_mobile_proof_before_accounts;
revoke all on function public.cp_mobile_assign_before_accounts(text,text,uuid),public.cp_mobile_take_before_accounts(text,text,uuid),
 public.cp_mobile_proof_before_accounts(text,text,text,uuid) from public,anon,authenticated,service_role;
create function public.cp_mobile_assign_fh3(p_order_ref text,p_employee_code text,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform public.cp_monitor_operation_guard(p_order_ref,p_employee_code,p_actor_id);
 return public.cp_mobile_assign_before_accounts(p_order_ref,p_employee_code,p_actor_id); end $$;
create function public.cp_mobile_take_begin(p_order_ref text,p_employee_code text,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform public.cp_monitor_operation_guard(p_order_ref,p_employee_code,p_actor_id);
 return public.cp_mobile_take_before_accounts(p_order_ref,p_employee_code,p_actor_id); end $$;
create function public.cp_mobile_proof_begin(p_order_ref text,p_employee_code text,p_action text,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform public.cp_monitor_operation_guard(p_order_ref,p_employee_code,p_actor_id);
 return public.cp_mobile_proof_before_accounts(p_order_ref,p_employee_code,p_action,p_actor_id); end $$;

-- Mutable operational controls; closed wages/beneficiaries are immutable snapshots.
create function public.cp_monitor_manage_order(p_actor uuid,p_ref text,p_version bigint,p_action text,
 p_reason text,p_state text default null,p_wage bigint default null,p_employee text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cp_fh3_monitor_controls; old_data jsonb; emp jsonb; proof public.cp_mobile_order_proof;
 receipt public.cp_fh3_telegram_manual_orders; job public.cp_fh3_monitor_jobs;
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);
 perform public.cp_monitor_lock_order(p_ref);
 if length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Alasan wajib 3–500 karakter.'; end if;
 insert into public.cp_fh3_monitor_controls(order_ref) values(p_ref) on conflict do nothing;
 select * into c from public.cp_fh3_monitor_controls where order_ref=p_ref for update;
 if p_version is distinct from c.version then raise exception 'Order berubah. Perbarui data sebelum menyimpan.'; end if;
 -- Never race with a photo/text already being sent to Telegram, including ambiguous outcomes.
 if exists(select 1 from public.cp_mobile_order_take where order_ref=p_ref and status in ('sending','unknown'))
 or exists(select 1 from public.cp_mobile_order_proof where order_ref=p_ref and status in ('sending','unknown')) then
  raise exception 'Laporan Telegram belum pasti. Rekonsiliasi sebelum mengubah order.'; end if;
 old_data:=to_jsonb(c);
 select * into proof from public.cp_mobile_order_proof where order_ref=p_ref and action='done' and status='sent'
  and telegram_message_id>0 and sent_at is not null;
 select * into receipt from public.cp_fh3_telegram_manual_orders where order_ref=p_ref;
 select * into job from public.cp_fh3_monitor_jobs where order_ref=p_ref for update;
 if proof.id is not null and proof.chat_id is distinct from receipt.chat_id then raise exception 'Grup bukti berbeda.'; end if;
 if p_action in ('price','transfer') and exists(select 1 from public.cp_fh3_monitor_closing_items where order_ref=p_ref) then
  raise exception 'Order sudah Tutup Buku. Upah dan penerima tidak dapat diubah.'; end if;
 if p_action='archive' then c.archived:=true;
 elsif p_action='restore' then c.archived:=false;
 elsif p_action='status' then
  if p_state is null or p_state not in ('normal','refund','problem') then raise exception 'Status tidak valid.'; end if;
  c.state:=p_state;
 elsif p_action='price' then
  if proof.id is null or p_wage is null or p_wage<0 or p_wage>1000000000 then
   raise exception 'Isi upah rupiah utuh pada order dengan DONE terkonfirmasi.'; end if;
  c.wage_rupiah:=p_wage;
 elsif p_action='transfer' then
  select e into emp from public.cp_payroll_workspace w,lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
   where w.id=1 and e->>'code'=p_employee and e->>'team'='FH3' and e->>'workforceStatus' in ('NEW','SHIFT','FULL')
    and nullif(e->>'sheetRosterMissingAt','') is null;
  if emp is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;
  if (proof.id is null and job.employee_code=p_employee)
   or (proof.id is not null and coalesce(c.beneficiary_code,proof.employee_code)=p_employee) then
   raise exception 'Pilih karyawan yang berbeda untuk pemindahan.'; end if;
  if proof.id is null then
   if not receipt.active then raise exception 'Order tidak aktif.'; end if;
   -- Preserve every prior delivery verbatim before freeing the current assignment cycle.
   insert into public.cp_fh3_monitor_audit(actor_id,order_ref,action,reason,before_data)
   values(p_actor,p_ref,'transfer_delivery_history',p_reason,jsonb_build_object(
    'job',to_jsonb(job),'takes',(select jsonb_agg(to_jsonb(t)) from public.cp_mobile_order_take t where order_ref=p_ref),
    'proofs',(select jsonb_agg(to_jsonb(p)) from public.cp_mobile_order_proof p where order_ref=p_ref)));
   delete from public.cp_mobile_order_take where order_ref=p_ref;
   delete from public.cp_mobile_order_proof where order_ref=p_ref;
   insert into public.cp_fh3_monitor_jobs(order_ref,chat_id,source_message_id,employee_id,employee_code,employee_name,actor_id)
    values(p_ref,receipt.chat_id,receipt.message_id,emp->>'id',emp->>'code',emp->>'name',p_actor)
   on conflict(order_ref) do update set employee_id=excluded.employee_id,employee_code=excluded.employee_code,
    employee_name=excluded.employee_name,actor_id=p_actor,status='assigned',started_at=null,completed_at=null;
  end if;
  c.beneficiary_id:=emp->>'id'; c.beneficiary_code:=emp->>'code'; c.beneficiary_name:=emp->>'name';
 else raise exception 'Tindakan admin tidak valid.';
 end if;
 update public.cp_fh3_monitor_controls set state=c.state,archived=c.archived,wage_rupiah=c.wage_rupiah,
 beneficiary_id=c.beneficiary_id,beneficiary_code=c.beneficiary_code,beneficiary_name=c.beneficiary_name,
 version=version+1,updated_at=clock_timestamp() where order_ref=p_ref returning * into c;
 insert into public.cp_fh3_monitor_audit(actor_id,order_ref,action,reason,before_data,after_data)
 values(p_actor,p_ref,p_action,btrim(p_reason),old_data,to_jsonb(c));
 return jsonb_build_object('ok',true,'version',c.version);
end $$;

create function public.cp_monitor_close_book(p_actor uuid,p_id uuid,p_title text,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; total bigint; n integer;
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);
 -- Same binding/receipt -> workspace order as mutations and Telegram delivery claims.
 perform 1 from public.cp_payroll_telegram_divisions d join public.cp_fh3_telegram_manual_orders r
  on r.chat_id=d.chat_id and r.admin_user_id=d.fh3_order_sender_id where d.division='FH3' and d.active for share of d,r;
 perform 1 from public.cp_payroll_workspace where id=1 for update;
 if exists(select 1 from public.cp_fh3_monitor_closings where id=p_id) then
  return jsonb_build_object('ok',true,'alreadyClosed',true,'closingId',p_id); end if;
 if p_id is null or length(btrim(coalesce(p_title,''))) not between 3 and 100 then raise exception 'Judul Tutup Buku tidak valid.'; end if;
 select jsonb_agg(x order by x->>'orderRef'),sum((x->>'wageRupiah')::bigint),count(*) into snapshot,total,n from (
  select jsonb_build_object('orderRef',c.order_ref,'wageRupiah',c.wage_rupiah,'version',c.version,
   'employeeId',coalesce(c.beneficiary_id,e->>'id'),'employeeCode',coalesce(c.beneficiary_code,e->>'code'),
   'employeeName',coalesce(c.beneficiary_name,e->>'name'),'completedAt',p.sent_at,
   'game',r.game,'discord',r.discord,'task',r.task) x
  from public.cp_fh3_monitor_controls c
  join public.cp_fh3_telegram_manual_orders r using(order_ref)
  join public.cp_payroll_telegram_divisions d on d.division='FH3' and d.active and d.chat_id=r.chat_id and d.fh3_order_sender_id=r.admin_user_id
  join public.cp_mobile_order_proof p on p.order_ref=c.order_ref and p.action='done' and p.status='sent'
   and p.telegram_message_id>0 and p.sent_at is not null and p.chat_id=r.chat_id
  cross join public.cp_payroll_workspace w cross join lateral jsonb_array_elements(w.payload->'cp-ofs-demo-employees-v2') e
  where w.id=1 and e->>'code'=p.employee_code and e->>'team'='FH3'
   and c.state='normal' and not c.archived and c.wage_rupiah is not null
   and not exists(select 1 from public.cp_fh3_monitor_closing_items i where i.order_ref=c.order_ref)
 ) q;
 if n=0 then raise exception 'Belum ada order selesai yang dihargai untuk Tutup Buku.'; end if;
 -- Require the exact reviewed list/versions/amounts. No invisible additions or stale prices.
 if p_expected is distinct from (select jsonb_agg(jsonb_build_object('orderRef',x->>'orderRef',
  'version',(x->>'version')::bigint,'wageRupiah',(x->>'wageRupiah')::bigint) order by x->>'orderRef')
  from jsonb_array_elements(snapshot) x) then raise exception 'Daftar Tutup Buku berubah. Muat ulang dan periksa kembali.'; end if;
 insert into public.cp_fh3_monitor_closings(id,actor_id,title,total_rupiah,order_count) values(p_id,p_actor,btrim(p_title),total,n);
 insert into public.cp_fh3_monitor_closing_items(order_ref,closing_id,employee_id,employee_code,employee_name,wage_rupiah,completed_at,game,discord,task)
 select x->>'orderRef',p_id,x->>'employeeId',x->>'employeeCode',x->>'employeeName',(x->>'wageRupiah')::bigint,
  (x->>'completedAt')::timestamptz,x->>'game',x->>'discord',x->>'task' from jsonb_array_elements(snapshot) x;
 insert into public.cp_fh3_monitor_audit(actor_id,action,reason,after_data)
 values(p_actor,'close_book',btrim(p_title),jsonb_build_object('closingId',p_id,'totalRupiah',total,'orders',n));
 return jsonb_build_object('ok',true,'closingId',p_id,'totalRupiah',total,'orderCount',n);
end $$;

create function public.cp_monitor_login_limit(p_key text) returns boolean
language plpgsql security definer set search_path='' as $$ declare n integer; begin
 if p_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid limit key'; end if;
 delete from public.cp_fh3_monitor_login_limits where bucket<now()-interval '20 minutes';
 insert into public.cp_fh3_monitor_login_limits(key,bucket,attempts) values(p_key,now(),1)
 on conflict(key) do update set attempts=case when cp_fh3_monitor_login_limits.bucket<now()-interval '10 minutes' then 1
  else cp_fh3_monitor_login_limits.attempts+1 end,
  bucket=case when cp_fh3_monitor_login_limits.bucket<now()-interval '10 minutes' then now() else cp_fh3_monitor_login_limits.bucket end
 returning attempts into n; return n<=15;
end $$;
revoke all on function public.cp_monitor_bind_account(uuid,uuid,text,boolean),public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text),
 public.cp_monitor_close_book(uuid,uuid,text,jsonb),public.cp_monitor_login_limit(text),
 public.cp_mobile_assign_fh3(text,text,uuid),public.cp_mobile_take_begin(text,text,uuid),public.cp_mobile_proof_begin(text,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cp_monitor_bind_account(uuid,uuid,text,boolean),public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text),
 public.cp_monitor_close_book(uuid,uuid,text,jsonb),public.cp_monitor_login_limit(text),
 public.cp_mobile_assign_fh3(text,text,uuid),public.cp_mobile_take_begin(text,text,uuid),public.cp_mobile_proof_begin(text,text,text,uuid)
 to service_role;
