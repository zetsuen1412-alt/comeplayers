-- FH3 dispatch is app-only: a deliberate TAKE ORDER produces a single Telegram
-- text notice, followed by START/DONE screenshot proof. Never post NEW ORDER cards.
create table if not exists public.cp_mobile_order_take (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null unique,
  employee_code text not null,
  actor_id uuid not null,
  status text not null default 'sending'
    check (status in ('sending','sent','failed','unknown')),
  chat_id bigint not null,
  chat_title text,
  caption text not null,
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists cp_mobile_take_employee_idx
  on public.cp_mobile_order_take(employee_code,created_at desc);
alter table public.cp_mobile_order_take enable row level security;
revoke all on public.cp_mobile_order_take from public,anon,authenticated;
grant select,insert,update on public.cp_mobile_order_take to service_role;

-- Claim under the SAME workspace lock as atomic Payroll assignment.
-- Failed/rejected Telegram messages can be sent again; ambiguous messages cannot.
create or replace function public.cp_mobile_take_begin(
 p_order_ref text,p_employee_code text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 w jsonb; item jsonb; emp jsonb; dest public.cp_payroll_telegram_divisions;
 row public.cp_mobile_order_take; ref text; code text; caption text; slug text;
begin
 if p_actor_id is null or nullif(btrim(p_order_ref),'') is null
   or nullif(btrim(p_employee_code),'') is null then
   raise exception 'Kode order dan karyawan wajib diisi.';
 end if;
 select payload into w from public.cp_payroll_workspace where id=1 for update;
 if w is null then raise exception 'Payroll workspace tidak tersedia.'; end if;
 select value into item from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]'::jsonb))
   where lower(value->>'externalReference')=lower(btrim(p_order_ref));
 if item is null then raise exception 'Order tidak ditemukan.'; end if;
 ref:=item->>'externalReference';
 if ref !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'Kode order tidak valid.'; end if;
 code:=item->'workerAssignments'->0->>'employeeCode';
 if item->>'team'<>'FH3' or item->>'orderType' not in ('boosting','item')
   or item->>'scheduleMode'='daily'
   or coalesce(jsonb_array_length(item->'workerAssignments'),0)<>1
   or code is distinct from btrim(p_employee_code)
   or item->'workerAssignments'->0->>'id' not like 'mobile:%'
   or item->>'operationalStatus' not in ('assigned','in_progress')
   or nullif(item->>'sheetDeletedAt','') is not null
   or nullif(item->>'websiteDeletedAt','') is not null
   or nullif(item->>'verifiedAt','') is not null
   or nullif(item->>'payrollClosedAt','') is not null then
   raise exception 'Order bukan tugas FH3 yang ditugaskan melalui aplikasi.';
 end if;
 select value into emp from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]'::jsonb))
   where value->>'code'=code and value->>'team'='FH3'
     and coalesce(value->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL')
     and nullif(value->>'sheetRosterMissingAt','') is null;
 if emp is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;
 select * into dest from public.cp_payroll_telegram_divisions
   where division='FH3' and active for share;
 if dest.chat_id is null or dest.chat_id>=0 then
   raise exception 'Grup Telegram FH3 belum terhubung dengan benar.';
 end if;
 slug:=btrim(regexp_replace(lower(btrim(emp->>'name')),'[^a-z0-9]+','-','g'),'-');
 if slug='' then raise exception 'Nama karyawan tidak valid.'; end if;
 caption:=lower(ref)||'/'||left(slug,65)||'/take';
 select * into row from public.cp_mobile_order_take
   where order_ref=ref for update;
 if row.id is not null then
   if row.employee_code<>code then raise exception 'TAKE tercatat untuk karyawan lain.'; end if;
   if row.status='sent' then
     return jsonb_build_object('ok',true,'alreadySent',true,'caption',row.caption,
       'chatTitle',row.chat_title,'messageId',row.telegram_message_id);
   end if;
   if row.status in ('sending','unknown') then
     raise exception 'TAKE sudah dimulai atau status Telegram belum pasti. Periksa grup, jangan kirim ulang.';
   end if;
 end if;
 if item->>'operationalStatus'<>'assigned' then
   raise exception 'Order sudah dimulai; TAKE tidak dapat dikirim setelah START.';
 end if;
 if row.id is null then
   insert into public.cp_mobile_order_take(order_ref,employee_code,actor_id,status,chat_id,chat_title,caption)
     values(ref,code,p_actor_id,'sending',dest.chat_id,dest.chat_title,caption)
     returning * into row;
 else
   update public.cp_mobile_order_take set status='sending',actor_id=p_actor_id,
     chat_id=dest.chat_id,chat_title=dest.chat_title,caption=caption
     where id=row.id returning * into row;
 end if;
 return jsonb_build_object('ok',true,'alreadySent',false,'eventId',row.id,
   'chatId',row.chat_id,'chatTitle',row.chat_title,'caption',caption);
end;
$fn$;

create or replace function public.cp_mobile_take_finish(
 p_event_id uuid,p_actor_id uuid,p_message_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare row public.cp_mobile_order_take;
begin
 if p_actor_id is null or p_message_id is null or p_message_id<=0 then
   raise exception 'Pesan TAKE belum terkonfirmasi Telegram.';
 end if;
 select * into row from public.cp_mobile_order_take where id=p_event_id for update;
 if row.id is null or row.actor_id<>p_actor_id or row.status<>'sending' then
   raise exception 'Status TAKE telah berubah; perlu pemeriksaan admin.';
 end if;
 update public.cp_mobile_order_take
   set status='sent',telegram_message_id=p_message_id,sent_at=clock_timestamp()
   where id=row.id;
 return jsonb_build_object('ok',true,'caption',row.caption,'chatTitle',row.chat_title,
   'messageId',p_message_id,'takeSent',true);
end;
$fn$;

create or replace function public.cp_mobile_take_mark(
 p_event_id uuid,p_actor_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path='' as $fn$
begin
 if p_actor_id is null or p_status not in ('failed','unknown') then return false; end if;
 update public.cp_mobile_order_take set status=p_status
 where id=p_event_id and actor_id=p_actor_id and status='sending';
 return found;
end;
$fn$;

revoke all on function public.cp_mobile_take_begin(text,text,uuid),
 public.cp_mobile_take_finish(uuid,uuid,bigint),
 public.cp_mobile_take_mark(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cp_mobile_take_begin(text,text,uuid),
 public.cp_mobile_take_finish(uuid,uuid,bigint),
 public.cp_mobile_take_mark(uuid,uuid,text) to service_role;

-- Existing photo API must reject START without a confirmed preceding TAKE.
-- Photo message replies to the TAKE notification, keeping one thread.
do $migration$
declare src text; marker text;
begin
 src:=pg_get_functiondef('public.cp_mobile_proof_begin(text,text,text,uuid)'::regprocedure);
 marker:='  if (p_action=''start'' and item->>''operationalStatus''<>''assigned'')';
 if position('cp_mobile_order_take' in src)=0 then
   if position(marker in src)=0 then raise exception 'Unexpected mobile photo proof function'; end if;
   src:=replace(src,marker,
     '  if p_action=''start'' and not exists ('||E'\n'||
     '    select 1 from public.cp_mobile_order_take tk where tk.order_ref=ref'||E'\n'||
     '      and tk.employee_code=code and tk.status=''sent'' and tk.chat_id<0)'||E'\n'||
     '  ) then raise exception ''Kirim TAKE ke Telegram terlebih dahulu sebelum START.''; end if;'||E'\n'||
     marker);
   -- Prefer TAKE message_id over legacy order card when replying to START.
   src:=replace(src,
      'coalesce('||E'\n'||'          (select chats.message_id',
      'coalesce('||E'\n'||
      '          (select tk.telegram_message_id from public.cp_mobile_order_take tk'||E'\n'||
      '            where tk.order_ref=ref and tk.status=''sent'' and tk.chat_id=dest.chat_id'||E'\n'||
      '              and p_action=''start'' limit 1),'||E'\n'||
      '          (select chats.message_id');
   execute src;
 end if;
end
$migration$;
