-- Separate, repeatable photo reports. Existing Payroll/job status and START/DONE
-- evidence stay intact. A new START UUID isolates history after admin transfer.
create table public.cp_monitor_pause_events (
 id uuid primary key default gen_random_uuid(),
 order_ref text not null references public.cp_fh3_telegram_manual_orders(order_ref),
 start_event_id uuid not null, sequence_no bigint not null check(sequence_no>0),
 action text not null check(action in ('pause','continue')),
 employee_id text not null, employee_code text not null, employee_name text not null,
 actor_id uuid not null, chat_id bigint not null check(chat_id<0), chat_title text,
 caption text not null, reply_to_message_id bigint not null check(reply_to_message_id>0),
 status text not null default 'sending' check(status in ('sending','sent','failed','unknown')),
 telegram_message_id bigint, telegram_file_id text, created_at timestamptz not null default clock_timestamp(), sent_at timestamptz,
 unique(order_ref,start_event_id,sequence_no),
 check(status<>'sent' or (telegram_message_id is not null and telegram_message_id>0 and nullif(btrim(telegram_file_id),'') is not null and sent_at is not null))
);
create index cp_monitor_pause_open_idx on public.cp_monitor_pause_events(order_ref) where status in ('sending','unknown');
alter table public.cp_monitor_pause_events enable row level security;
revoke all on public.cp_monitor_pause_events from public,anon,authenticated,service_role;
grant select on public.cp_monitor_pause_events to service_role;

create function public.cp_monitor_pause_states(p_refs text[])
returns table(order_ref text,start_event_id uuid,revision bigint,paused boolean,uncertain boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if cardinality(p_refs) is null or cardinality(p_refs) not between 1 and 80 then raise exception 'Batch order tidak valid.'; end if;
 return query select p.order_ref,p.id,coalesce(last_event.sequence_no,0),coalesce(last_event.action='pause',false),
   exists(select 1 from public.cp_monitor_pause_events e where e.order_ref=p.order_ref and e.start_event_id=p.id and e.status in ('sending','unknown'))
 from public.cp_mobile_order_proof p
 left join lateral(select e.sequence_no,e.action from public.cp_monitor_pause_events e
   where e.order_ref=p.order_ref and e.start_event_id=p.id and e.status='sent' order by e.sequence_no desc limit 1) last_event on true
 where p.order_ref=any(p_refs) and p.action='start' and p.status='sent';
end $$;

create function public.cp_monitor_pause_context(p_ref text,p_code text,p_actor uuid,p_start uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; w jsonb; item jsonb; initial public.cp_mobile_order_proof;
begin
 perform public.cp_monitor_operation_guard(p_ref,p_code,p_actor);
 ctx:=public.cp_fh3_job_context(p_ref,p_code,false);
 select * into initial from public.cp_mobile_order_proof where order_ref=ctx->>'orderRef' and action='start' and status='sent' for update;
 if p_start is null or initial.id is distinct from p_start or initial.employee_code is distinct from ctx->>'employeeCode'
  or initial.chat_id is distinct from (ctx->>'chatId')::bigint or initial.telegram_message_id is null then
  raise exception 'START atau karyawan berubah. Segarkan tugas.'; end if;
 if not exists(select 1 from public.cp_mobile_order_take where order_ref=ctx->>'orderRef' and status='sent'
  and employee_code=initial.employee_code and chat_id=initial.chat_id and telegram_message_id>0) then raise exception 'TAKE belum terkonfirmasi.'; end if;
 if exists(select 1 from public.cp_mobile_order_proof where order_ref=ctx->>'orderRef' and action='done' and status in ('sending','unknown','sent')) then
  raise exception 'DONE sedang dikirim, belum pasti, atau sudah selesai.'; end if;
 if (ctx->>'jobExists')::boolean then
  if ctx->>'status' is distinct from 'in_progress' then raise exception 'Order belum START atau sudah selesai.'; end if;
 else
  select payload into w from public.cp_payroll_workspace where id=1;
  select e into item from jsonb_array_elements(w->'cp-ofs-demo-user-orders-v3') e where upper(btrim(e->>'externalReference'))=ctx->>'orderRef';
  if item is null or item->>'operationalStatus' is distinct from 'in_progress' or item->>'team' is distinct from 'FH3'
   or coalesce(item->>'orderType','') not in ('boosting','item') or item->>'scheduleMode'='daily'
   or coalesce(jsonb_array_length(item->'workerAssignments'),0)<>1
   or item->'workerAssignments'->0->>'employeeCode' is distinct from initial.employee_code
   or coalesce(item->'workerAssignments'->0->>'id','') not like 'mobile:%'
   or nullif(item->>'sheetDeletedAt','') is not null or nullif(item->>'websiteDeletedAt','') is not null
   or nullif(item->>'completedAt','') is not null or nullif(item->>'verifiedAt','') is not null
   or nullif(item->>'payrollClosedAt','') is not null or nullif(item->>'payrollPeriodId','') is not null
   or item->>'financeStatus' in ('verified','reconciled','ready_to_close','closed') then
   raise exception 'Order tidak memenuhi syarat PAUSE/CONTINUE.'; end if;
 end if;
 return ctx||jsonb_build_object('startEventId',initial.id,'startMessageId',initial.telegram_message_id);
end $$;

create function public.cp_monitor_pause_begin(p_order_ref text,p_employee_code text,p_action text,p_actor_id uuid,p_start_event_id uuid,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; previous public.cp_monitor_pause_events; event public.cp_monitor_pause_events; current_revision bigint; slug text;
begin
 if p_actor_id is null or p_action is null or p_action not in ('pause','continue') or p_revision is null or p_revision not between 0 and 1000000 then raise exception 'Aksi PAUSE/CONTINUE tidak valid.'; end if;
 ctx:=public.cp_monitor_pause_context(p_order_ref,p_employee_code,p_actor_id,p_start_event_id);
 select * into previous from public.cp_monitor_pause_events where order_ref=ctx->>'orderRef' and start_event_id=p_start_event_id and status='sent' order by sequence_no desc limit 1;
 current_revision:=coalesce(previous.sequence_no,0);
 if p_revision+1=current_revision and previous.action=p_action then
  return jsonb_build_object('ok',true,'alreadySent',true,'caption',previous.caption,'chatTitle',previous.chat_title,'status',case when p_action='pause' then 'paused' else 'in_progress' end,'pauseRevision',current_revision); end if;
 if p_revision<>current_revision then raise exception 'Status PAUSE berubah. Segarkan tugas sebelum mengirim.'; end if;
 if (p_action='pause' and previous.action='pause') or (p_action='continue' and previous.action is distinct from 'pause') then
  raise exception 'Urutan harus START, PAUSE, CONTINUE, lalu PAUSE atau DONE.'; end if;
 select * into event from public.cp_monitor_pause_events where order_ref=ctx->>'orderRef' and start_event_id=p_start_event_id and sequence_no=current_revision+1 for update;
 if event.status in ('sending','unknown') then raise exception 'Laporan PAUSE/CONTINUE belum pasti. Periksa grup; jangan kirim ulang.'; end if;
 if event.id is not null and (event.action<>p_action or event.employee_code<>ctx->>'employeeCode' or event.chat_id<>(ctx->>'chatId')::bigint) then raise exception 'Identitas laporan berubah. Hubungi admin.'; end if;
 slug:=btrim(regexp_replace(lower(ctx->>'employeeName'),'[^a-z0-9]+','-','g'),'-');
 if slug='' then raise exception 'Nama karyawan tidak valid.'; end if;
 if event.id is null then
  insert into public.cp_monitor_pause_events(order_ref,start_event_id,sequence_no,action,employee_id,employee_code,employee_name,actor_id,chat_id,chat_title,caption,reply_to_message_id)
  values(ctx->>'orderRef',p_start_event_id,current_revision+1,p_action,ctx->>'employeeId',ctx->>'employeeCode',ctx->>'employeeName',p_actor_id,(ctx->>'chatId')::bigint,ctx->>'chatTitle',lower(ctx->>'orderRef')||'/'||left(slug,65)||'/'||p_action,coalesce(previous.telegram_message_id,(ctx->>'startMessageId')::bigint)) returning * into event;
 else update public.cp_monitor_pause_events set status='sending',actor_id=p_actor_id where id=event.id returning * into event;
 end if;
 return jsonb_build_object('ok',true,'alreadySent',false,'eventId',event.id,'caption',event.caption,'chatId',event.chat_id,'chatTitle',event.chat_title,'replyToMessageId',event.reply_to_message_id);
end $$;

create function public.cp_monitor_pause_finish(p_event_id uuid,p_actor_id uuid,p_message_id bigint,p_file_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event public.cp_monitor_pause_events; ctx jsonb;
begin
 select * into event from public.cp_monitor_pause_events where id=p_event_id;
 if event.id is null then raise exception 'Laporan tidak ditemukan.'; end if;
 ctx:=public.cp_monitor_pause_context(event.order_ref,event.employee_code,p_actor_id,event.start_event_id);
 select * into event from public.cp_monitor_pause_events where id=p_event_id for update;
 if p_actor_id is null or event.actor_id is distinct from p_actor_id or event.status<>'sending'
  or p_message_id is null or p_message_id<=0 or nullif(btrim(p_file_id),'') is null
  or event.chat_id is distinct from (ctx->>'chatId')::bigint or event.employee_id is distinct from ctx->>'employeeId' then raise exception 'Bukti PAUSE/CONTINUE belum terkonfirmasi.'; end if;
 update public.cp_monitor_pause_events set status='sent',telegram_message_id=p_message_id,telegram_file_id=p_file_id,sent_at=clock_timestamp() where id=p_event_id;
 return jsonb_build_object('ok',true,'caption',event.caption,'chatTitle',event.chat_title,'status',case when event.action='pause' then 'paused' else 'in_progress' end,'pauseRevision',event.sequence_no);
end $$;

create function public.cp_monitor_pause_mark(p_event_id uuid,p_actor_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_actor_id is null or p_status is null or p_status not in ('failed','unknown') then return false; end if;
 update public.cp_monitor_pause_events set status=p_status where id=p_event_id and actor_id=p_actor_id and status='sending';return found;
end $$;

-- Older APKs/EXEs must not bypass PAUSE or race a pending break report via DONE.
create or replace function public.cp_mobile_proof_begin(p_order_ref text,p_employee_code text,p_action text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare initial uuid; last_action text;
begin
 perform public.cp_monitor_operation_guard(p_order_ref,p_employee_code,p_actor_id);
 select id into initial from public.cp_mobile_order_proof where order_ref=upper(btrim(p_order_ref)) and action='start' and status='sent';
 if exists(select 1 from public.cp_monitor_pause_events where order_ref=upper(btrim(p_order_ref)) and start_event_id=initial and status in ('sending','unknown')) then
  raise exception 'Laporan PAUSE/CONTINUE belum pasti. Periksa grup terlebih dahulu.'; end if;
 select action into last_action from public.cp_monitor_pause_events where order_ref=upper(btrim(p_order_ref)) and start_event_id=initial and status='sent' order by sequence_no desc limit 1;
 if p_action='done' and last_action='pause' then raise exception 'Order sedang PAUSE. Kirim CONTINUE sebelum DONE.'; end if;
 return public.cp_mobile_proof_before_accounts(p_order_ref,p_employee_code,p_action,p_actor_id);
end $$;

alter function public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text) rename to cp_monitor_manage_before_pause;
revoke all on function public.cp_monitor_manage_before_pause(uuid,text,bigint,text,text,text,bigint,text) from public,anon,authenticated,service_role;
create function public.cp_monitor_manage_order(p_actor uuid,p_ref text,p_version bigint,p_action text,p_reason text,p_state text default null,p_wage bigint default null,p_employee text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);perform public.cp_monitor_lock_order(p_ref);
 if exists(select 1 from public.cp_monitor_pause_events where order_ref=p_ref and status in ('sending','unknown')) then
  raise exception 'Laporan PAUSE/CONTINUE belum pasti. Rekonsiliasi sebelum mengubah order.'; end if;
 return public.cp_monitor_manage_before_pause(p_actor,p_ref,p_version,p_action,p_reason,p_state,p_wage,p_employee);
end $$;
revoke all on function public.cp_monitor_pause_context(text,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.cp_monitor_pause_states(text[]),public.cp_monitor_pause_begin(text,text,text,uuid,uuid,bigint),
 public.cp_monitor_pause_finish(uuid,uuid,bigint,text),public.cp_monitor_pause_mark(uuid,uuid,text),public.cp_mobile_proof_begin(text,text,text,uuid),
 public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.cp_monitor_pause_states(text[]),public.cp_monitor_pause_begin(text,text,text,uuid,uuid,bigint),
 public.cp_monitor_pause_finish(uuid,uuid,bigint,text),public.cp_monitor_pause_mark(uuid,uuid,text),public.cp_mobile_proof_begin(text,text,text,uuid),
 public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text) to service_role;
