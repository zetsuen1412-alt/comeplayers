-- New Android proof workflow: Payroll is source of truth, Telegram is only an outbound photo transport.
-- Must be deployed after 20261019220000 and 20261019220001.
create table public.cp_mobile_order_proof (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null,
  employee_code text not null,
  action text not null check (action in ('start','done')),
  actor_id uuid not null,
  status text not null default 'sending' check (status in ('sending','sent','failed','unknown')),
  chat_id bigint not null,
  chat_title text,
  caption text not null,
  telegram_message_id bigint,
  telegram_file_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint cp_mobile_order_proof_once unique(order_ref,action)
);
create index cp_mobile_order_proof_employee_idx on public.cp_mobile_order_proof(employee_code,created_at desc);
alter table public.cp_mobile_order_proof enable row level security;
revoke all on public.cp_mobile_order_proof from public, anon, authenticated;
grant select,insert,update on public.cp_mobile_order_proof to service_role;

-- Claims each transition under a Payroll workspace lock. Client cannot select its own group.
create function public.cp_mobile_proof_begin(
  p_order_ref text, p_employee_code text, p_action text, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  w jsonb; item jsonb; worker jsonb;
  r public.cp_mobile_order_proof;
  dest public.cp_payroll_telegram_divisions;
  ref text; code text;
  caption text; slug text;
begin
  if p_actor_id is null or p_action not in ('start','done')
    or nullif(btrim(p_order_ref),'') is null or nullif(btrim(p_employee_code),'') is null then
    raise exception 'Permintaan bukti tidak valid.';
  end if;
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  if w is null then raise exception 'Payroll tidak ditemukan.'; end if;
  select value into item from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]'::jsonb))
    where lower(value->>'externalReference')=lower(btrim(p_order_ref));
  if item is null then raise exception 'Order tidak ditemukan.'; end if;
  ref:=item->>'externalReference';
  if ref !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'Kode order harus berupa huruf/angka tanpa karakter khusus.';
  end if;
  code:=item->'workerAssignments'->0->>'employeeCode';
  if coalesce(item->>'team','')<>'FH3'
    or coalesce(item->>'orderType','') not in ('boosting','item')
    or coalesce(jsonb_array_length(item->'workerAssignments'),0)<>1
    or code is distinct from btrim(p_employee_code)
    or item->>'scheduleMode'='daily'
    or nullif(item->>'sheetDeletedAt','') is not null
    or nullif(item->>'websiteDeletedAt','') is not null
    or nullif(item->>'verifiedAt','') is not null
    or nullif(item->>'payrollClosedAt','') is not null
    or nullif(item->>'payrollPeriodId','') is not null
    or item->>'financeStatus'='closed' then
    raise exception 'Order tidak memenuhi syarat pengiriman bukti.';
  end if;
  select value into worker from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]'::jsonb))
    where value->>'code'=code and value->>'team'='FH3'
      and coalesce(value->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL')
      and nullif(value->>'sheetRosterMissingAt','') is null;
  if worker is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;
  if (p_action='start' and item->>'operationalStatus'<>'assigned')
    or (p_action='done' and item->>'operationalStatus'<>'in_progress')
    or (p_action='done' and not exists (
      select 1 from public.cp_mobile_order_proof evidence
      where evidence.order_ref=ref and evidence.action='start'
        and evidence.status='sent' and evidence.employee_code=code
    )) then
    raise exception 'Urutan order bukan START lalu DONE atau status sudah berubah.';
  end if;
  select * into dest from public.cp_payroll_telegram_divisions
    where division='FH3' and active for share;
  if dest.chat_id is null then raise exception 'Grup Telegram FH3 belum dikonfigurasi di website.'; end if;
  slug:=regexp_replace(lower(btrim(worker->>'name')),'[^a-z0-9]+','-','g');
  slug:=btrim(slug,'-');
  if slug='' then raise exception 'Nama karyawan tidak valid untuk caption.'; end if;
  caption:=lower(ref)||'/'||left(slug,65)||'/'||p_action;
  select * into r from public.cp_mobile_order_proof
    where order_ref=ref and action=p_action for update;
  if r.id is not null and r.status='sent' then
    return jsonb_build_object('ok',true,'alreadySent',true,'eventId',r.id,
      'caption',r.caption,'chatTitle',r.chat_title);
  end if;
  if r.id is not null and r.status in ('sending','unknown') then
    raise exception 'Pengiriman bukti masih berlangsung atau perlu diperiksa admin. Jangan kirim ulang.';
  end if;
  if r.id is null then
    insert into public.cp_mobile_order_proof
      (order_ref,employee_code,action,actor_id,chat_id,chat_title,caption)
      values(ref,code,p_action,p_actor_id,dest.chat_id,dest.chat_title,caption)
      returning * into r;
  else
    update public.cp_mobile_order_proof
      set status='sending',actor_id=p_actor_id,employee_code=code,
        chat_id=dest.chat_id,chat_title=dest.chat_title,caption=caption
      where id=r.id returning * into r;
  end if;
  return jsonb_build_object('ok',true,'alreadySent',false,'eventId',r.id,
    'caption',caption,'chatId',r.chat_id,'chatTitle',r.chat_title);
end;
$$;

-- Called only with a successfully acknowledged sendPhoto message_id.
create function public.cp_mobile_proof_finish(
  p_event_id uuid,p_actor_id uuid,p_message_id bigint,p_file_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  w jsonb; item jsonb; r public.cp_mobile_order_proof;
  updated_orders jsonb; resulting_status text; ref text;
begin
  if p_actor_id is null or p_message_id is null or p_message_id<=0
    or nullif(btrim(p_file_id),'') is null then raise exception 'Bukti Telegram belum terkonfirmasi.'; end if;
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  select * into r from public.cp_mobile_order_proof where id=p_event_id for update;
  if r.id is null or r.actor_id<>p_actor_id or r.status<>'sending' then
    raise exception 'Pengiriman bukti tidak dapat diselesaikan.';
  end if;
  select value into item from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]'::jsonb))
    where value->>'externalReference'=r.order_ref;
  if item is null or item->'workerAssignments'->0->>'employeeCode'<>r.employee_code
    or (r.action='start' and item->>'operationalStatus'<>'assigned')
    or (r.action='done' and item->>'operationalStatus'<>'in_progress') then
    raise exception 'Status order berubah saat foto dikirim; admin harus melakukan rekonsiliasi.';
  end if;
  resulting_status:=case when r.action='start' then 'in_progress' else 'completed' end;
  select jsonb_agg(case when j->>'externalReference'=r.order_ref then
    j || jsonb_build_object('operationalStatus',resulting_status)
      || case when r.action='done' then jsonb_build_object('completedAt',now()) else '{}'::jsonb end
    else j end order by n)
    into updated_orders
    from jsonb_array_elements(w->'cp-ofs-demo-user-orders-v3') with ordinality x(j,n);
  update public.cp_payroll_workspace
    set payload=jsonb_set(w,'{cp-ofs-demo-user-orders-v3}',updated_orders),
      revision=revision+1,updated_at=clock_timestamp() where id=1;
  update public.cp_mobile_order_proof
    set status='sent',telegram_message_id=p_message_id,telegram_file_id=p_file_id,sent_at=now()
    where id=p_event_id;
  return jsonb_build_object('ok',true,'caption',r.caption,'orderRef',r.order_ref,
    'status',resulting_status,'chatTitle',r.chat_title);
end;
$$;

-- Failures clearly rejected by Telegram can retry; network ambiguity MUST NOT auto-retry.
create function public.cp_mobile_proof_mark(
  p_event_id uuid,p_actor_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_actor_id is null or p_status not in ('failed','unknown') then return false; end if;
  update public.cp_mobile_order_proof set status=p_status
    where id=p_event_id and actor_id=p_actor_id and status='sending';
  return found;
end;
$$;

revoke all on function public.cp_mobile_proof_begin(text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.cp_mobile_proof_finish(uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.cp_mobile_proof_mark(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cp_mobile_proof_begin(text,text,text,uuid) to service_role;
grant execute on function public.cp_mobile_proof_finish(uuid,uuid,bigint,text) to service_role;
grant execute on function public.cp_mobile_proof_mark(uuid,uuid,text) to service_role;
