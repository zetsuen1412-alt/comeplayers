-- A separate operational journal: no historical Payroll/salary/Closing rewrite.
create table public.cp_monitor_daily_plans (
 order_ref text primary key references public.cp_fh3_monitor_jobs(order_ref),
 duration text not null check(length(duration)<=200), source_message_id bigint not null,
 total_days integer not null check(total_days between 2 and 366),
 hours_per_day numeric check(hours_per_day>0 and hours_per_day<=24),
 completed_days integer not null default 0 check(completed_days>=0 and completed_days<=total_days),
 revision bigint not null default 0 check(revision>=0), cycle_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp()
);
create table public.cp_monitor_daily_events (
 id uuid primary key default gen_random_uuid(),
 order_ref text not null references public.cp_monitor_daily_plans(order_ref),
 day_no integer not null check(day_no between 1 and 366), cycle_id uuid not null,
 sequence_no bigint not null check(sequence_no>0),
 action text not null check(action in ('start','pause','continue','done')),
 employee_id text not null, employee_code text not null, employee_name text not null,
 actor_id uuid not null, chat_id bigint not null check(chat_id<0), chat_title text,
 caption text not null, reply_to_message_id bigint not null check(reply_to_message_id>0),
 status text not null default 'sending' check(status in ('sending','sent','failed','unknown')),
 telegram_message_id bigint, telegram_file_id text,
 created_at timestamptz not null default clock_timestamp(), sent_at timestamptz,
 unique(order_ref,sequence_no),
 check(status<>'sent' or (telegram_message_id is not null and telegram_message_id>0 and telegram_file_id is not null and length(btrim(telegram_file_id))>0 and sent_at is not null))
);
create index cp_monitor_daily_open_idx on public.cp_monitor_daily_events(order_ref) where status in ('sending','unknown');
create unique index cp_monitor_daily_done_idx on public.cp_monitor_daily_events(order_ref,day_no) where action='done' and status='sent';
alter table public.cp_monitor_daily_plans enable row level security;
alter table public.cp_monitor_daily_events enable row level security;
revoke all on public.cp_monitor_daily_plans,public.cp_monitor_daily_events from public,anon,authenticated,service_role;
grant select on public.cp_monitor_daily_plans,public.cp_monitor_daily_events to service_role;

-- Same fixtures exercise this parser and the display-only TypeScript parser.
create function public.cp_monitor_duration(p_text text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare t text; m text[]; days numeric[]:='{}'; hrs numeric[]:='{}'; d numeric:=1; h numeric; n integer; review boolean:=false;
begin
 t:=replace(replace(replace(lower(left(coalesce(p_text,''),200)),'×','x'),'*','x'),',','.');
 t:=replace(replace(replace(t,'sebulan','1 bulan'),'seminggu','1 minggu'),'sehari','1 hari');
 for m in select regexp_matches(t,'(?<![0-9.])([0-9]+(?:\.[0-9]+)?)\s*(hours?|hrs?|jam|h)(?=x|[^a-z]|$)','g') loop hrs:=array_append(hrs,m[1]::numeric); end loop;
 for m in select regexp_matches(t,'(?<![0-9.])([0-9]+(?:\.[0-9]+)?)\s*(days?|hari|weeks?|wks?|minggu|pekan|months?|mos?|bulan)(?=[^a-z]|$)','g') loop
  days:=array_append(days,m[1]::numeric*case when m[2]~'^(week|wk|minggu|pekan)' then 7 when m[2]~'^(month|mo|bulan)' then 30 else 1 end);
 end loop;
 for m in select regexp_matches(t,'(?<![0-9.])[0-9]+(?:\.[0-9]+)?\s*(?:hours?|hrs?|jam|h)(?:\s*(?:/\s*(?:day|hari)|per\s+(?:day|hari)))?\s*x\s*([0-9]+(?:\.[0-9]+)?)(?!\s*(?:weeks?|wks?|minggu|pekan|months?|mos?|bulan))(?=[^0-9.]|$)','g') loop days:=array_append(days,m[1]::numeric); end loop;
 select count(distinct x),coalesce(min(x),1) into n,d from unnest(days) x;
 review:=n>1 or d<>trunc(d) or d<1 or d>366;
 select count(distinct x),min(x) into n,h from unnest(hrs) x;
 if cardinality(days)=0 and n=1 and h>24 then
  if mod(h,24)=0 then d:=h/24;h:=24;review:=d>366;
  else review:=true; end if;
 end if;
 if d>1 and (n>1 or h<=0 or h>24 or t~'[0-9]\s*[-–]\s*[0-9]') then review:=true; end if;
 return jsonb_build_object('totalDays',case when review then null else d::integer end,'hoursPerDay',case when not review and d>1 then h else null end,
  'daily',not review and d>1,'durationNeedsReview',review);
end $$;

-- Freeze future multi-day orders when first assigned. Existing assignments stay intact.
alter function public.cp_mobile_assign_fh3(text,text,uuid) rename to cp_monitor_assign_before_daily;
revoke all on function public.cp_monitor_assign_before_daily(text,text,uuid) from public,anon,authenticated,service_role;
create function public.cp_mobile_assign_fh3(p_order_ref text,p_employee_code text,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx jsonb; receipt public.cp_fh3_telegram_manual_orders; parsed jsonb; item jsonb;
begin
 perform public.cp_monitor_operation_guard(p_order_ref,p_employee_code,p_actor_id);
 ctx:=public.cp_fh3_job_context(p_order_ref,p_employee_code,false);
 if (ctx->>'jobExists')::boolean then return public.cp_monitor_assign_before_daily(p_order_ref,p_employee_code,p_actor_id); end if;
 select * into receipt from public.cp_fh3_telegram_manual_orders where order_ref=ctx->>'orderRef';
 parsed:=public.cp_monitor_duration(receipt.duration);
 if (parsed->>'durationNeedsReview')::boolean then raise exception 'Duration tidak jelas. Koreksi durasi hari pada pesan admin sebelum TAKE.'; end if;
 if not (parsed->>'daily')::boolean then return public.cp_monitor_assign_before_daily(p_order_ref,p_employee_code,p_actor_id); end if;
 if exists(select 1 from public.cp_mobile_order_take where order_ref=receipt.order_ref)
  or exists(select 1 from public.cp_mobile_order_proof where order_ref=receipt.order_ref) then
  -- A pre-existing Payroll assignment/report must never be silently converted.
  return public.cp_monitor_assign_before_daily(p_order_ref,p_employee_code,p_actor_id);
 end if;
 select e into item from public.cp_payroll_workspace w,lateral jsonb_array_elements(w.payload->'cp-ofs-demo-user-orders-v3') e
  where w.id=1 and upper(btrim(e->>'externalReference'))=receipt.order_ref;
 if item is not null and (item->>'team' is distinct from 'FH3' or coalesce(item->>'orderType','') not in ('boosting','item')
  or coalesce(item->>'operationalStatus','') not in ('draft','confirmed','assignment_pending')
  or coalesce(jsonb_array_length(item->'workerAssignments'),0)>0 or nullif(item->>'employeeCode','') is not null or nullif(item->>'employeeName','') is not null
  or coalesce((item->>'importNeedsReview')::boolean,false) or item->>'scheduleMode'='daily'
  or nullif(item->>'sheetDeletedAt','') is not null or nullif(item->>'websiteDeletedAt','') is not null
  or nullif(item->>'completedAt','') is not null or nullif(item->>'verifiedAt','') is not null
  or nullif(item->>'payrollClosedAt','') is not null or nullif(item->>'payrollPeriodId','') is not null
  or item->>'financeStatus' in ('verified','reconciled','ready_to_close','closed')) then raise exception 'Order Payroll sudah diproses dan tidak boleh dikonversi.'; end if;
 insert into public.cp_fh3_monitor_jobs(order_ref,chat_id,source_message_id,employee_id,employee_code,employee_name,actor_id)
 values(receipt.order_ref,receipt.chat_id,receipt.message_id,ctx->>'employeeId',ctx->>'employeeCode',ctx->>'employeeName',p_actor_id);
 insert into public.cp_monitor_daily_plans(order_ref,duration,source_message_id,total_days,hours_per_day)
 values(receipt.order_ref,left(receipt.duration,200),receipt.message_id,(parsed->>'totalDays')::integer,(parsed->>'hoursPerDay')::numeric);
 insert into public.cp_mobile_assignment_audit(order_ref,employee_code,actor_id) values(receipt.order_ref,ctx->>'employeeCode',p_actor_id);
 return jsonb_build_object('ok',true,'orderRef',receipt.order_ref,'employeeCode',ctx->>'employeeCode','employeeName',ctx->>'employeeName',
  'source','telegram_job','alreadyAssigned',false,'daily',true,'totalDays',(parsed->>'totalDays')::integer);
end $$;

create function public.cp_monitor_daily_states(p_refs text[])
returns table(order_ref text,duration text,total_days integer,hours_per_day numeric,completed_days integer,revision bigint,cycle_id uuid,phase text,uncertain boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if cardinality(p_refs) is null or cardinality(p_refs) not between 1 and 80 then raise exception 'Batch order tidak valid.'; end if;
 return query select p.order_ref,p.duration,p.total_days,p.hours_per_day,p.completed_days,p.revision,p.cycle_id,
  case when p.completed_days=p.total_days then 'completed' when latest.action='pause' then 'paused'
   when latest.action in ('start','continue') then 'running' else 'waiting' end,
  exists(select 1 from public.cp_monitor_daily_events e where e.order_ref=p.order_ref and e.status in ('sending','unknown'))
 from public.cp_monitor_daily_plans p left join lateral(
  select e.action from public.cp_monitor_daily_events e where e.order_ref=p.order_ref and e.cycle_id=p.cycle_id
   and e.day_no=p.completed_days+1 and e.status='sent' order by e.sequence_no desc limit 1) latest on true
 where p.order_ref=any(p_refs);
end $$;

create function public.cp_monitor_daily_context(p_ref text,p_code text,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; plan public.cp_monitor_daily_plans;
begin
 perform public.cp_monitor_operation_guard(p_ref,p_code,p_actor);
 ctx:=public.cp_fh3_job_context(p_ref,p_code,true);
 select * into plan from public.cp_monitor_daily_plans where order_ref=ctx->>'orderRef' for update;
 if plan.order_ref is null then raise exception 'Order bukan pekerjaan harian.'; end if;
 if plan.source_message_id is distinct from (ctx->>'sourceMessageId')::bigint then raise exception 'Pesan sumber berubah. Hubungi admin untuk pemeriksaan.'; end if;
 if not exists(select 1 from public.cp_mobile_order_take where order_ref=plan.order_ref and status='sent'
  and employee_code=ctx->>'employeeCode' and chat_id=(ctx->>'chatId')::bigint and telegram_message_id>0) then raise exception 'TAKE belum terkonfirmasi.'; end if;
 return ctx;
end $$;

create function public.cp_monitor_daily_begin(p_order_ref text,p_employee_code text,p_action text,p_actor_id uuid,p_day integer,p_revision bigint,p_cycle uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; plan public.cp_monitor_daily_plans; event public.cp_monitor_daily_events; previous public.cp_monitor_daily_events; reply_id bigint; slug text;
begin
 if p_action is null or p_action not in ('start','pause','continue','done') or p_day is null or p_day not between 1 and 366
  or p_revision is null or p_revision not between 0 and 1000000 or p_cycle is null then raise exception 'Laporan hari tidak valid.'; end if;
 ctx:=public.cp_monitor_daily_context(p_order_ref,p_employee_code,p_actor_id);
 select * into plan from public.cp_monitor_daily_plans where order_ref=ctx->>'orderRef' for update;
 if p_cycle is distinct from plan.cycle_id then raise exception 'Penugasan berubah. Segarkan tugas.'; end if;
 select * into event from public.cp_monitor_daily_events where order_ref=plan.order_ref and sequence_no=p_revision+1 for update;
 if event.id is not null and (event.cycle_id<>p_cycle or event.day_no<>p_day or event.action<>p_action or event.employee_code<>ctx->>'employeeCode') then
  raise exception 'Laporan atau hari berubah. Segarkan tugas.'; end if;
 if event.status='sent' then return jsonb_build_object('ok',true,'alreadySent',true,'caption',event.caption,'chatTitle',event.chat_title,
  'dayNumber',event.day_no,'totalDays',plan.total_days,'completedDays',plan.completed_days); end if;
 if p_revision<>plan.revision or p_day<>plan.completed_days+1 or plan.completed_days>=plan.total_days then raise exception 'Hari atau progres berubah. Segarkan tugas.'; end if;
 if exists(select 1 from public.cp_monitor_daily_events where order_ref=plan.order_ref and status in ('sending','unknown')) then
  raise exception 'Laporan harian belum pasti. Periksa grup; jangan kirim ulang.'; end if;
 select * into previous from public.cp_monitor_daily_events where order_ref=plan.order_ref and day_no=p_day and cycle_id=p_cycle and status='sent' order by sequence_no desc limit 1;
 if (p_action='start' and (previous.id is not null or ctx->>'status' is distinct from 'assigned'))
  or (p_action in ('pause','done') and (previous.action is null or previous.action not in ('start','continue') or ctx->>'status' is distinct from 'in_progress'))
  or (p_action='continue' and (previous.action is distinct from 'pause' or ctx->>'status' is distinct from 'in_progress')) then
  raise exception 'Urutan hari harus START, PAUSE/CONTINUE bila perlu, lalu DONE.'; end if;
 if previous.telegram_message_id is not null then reply_id:=previous.telegram_message_id;
 else
  select telegram_message_id into reply_id from public.cp_monitor_daily_events where order_ref=plan.order_ref and status='sent' order by sequence_no desc limit 1;
  if reply_id is null then select telegram_message_id into reply_id from public.cp_mobile_order_take where order_ref=plan.order_ref and status='sent'; end if;
 end if;
 slug:=btrim(regexp_replace(lower(ctx->>'employeeName'),'[^a-z0-9]+','-','g'),'-');
 if slug='' then raise exception 'Nama karyawan tidak valid.'; end if;
 if event.id is null then
  insert into public.cp_monitor_daily_events(order_ref,day_no,cycle_id,sequence_no,action,employee_id,employee_code,employee_name,actor_id,chat_id,chat_title,caption,reply_to_message_id)
  values(plan.order_ref,p_day,p_cycle,p_revision+1,p_action,ctx->>'employeeId',ctx->>'employeeCode',ctx->>'employeeName',p_actor_id,(ctx->>'chatId')::bigint,
   ctx->>'chatTitle',lower(plan.order_ref)||'/'||left(slug,65)||'/day'||p_day||'/'||p_action,reply_id) returning * into event;
 else update public.cp_monitor_daily_events set status='sending',actor_id=p_actor_id where id=event.id returning * into event;
 end if;
 return jsonb_build_object('ok',true,'alreadySent',false,'eventId',event.id,'caption',event.caption,'chatId',event.chat_id,'chatTitle',event.chat_title,'replyToMessageId',event.reply_to_message_id);
end $$;

create function public.cp_monitor_daily_finish(p_event_id uuid,p_actor_id uuid,p_message_id bigint,p_file_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; plan public.cp_monitor_daily_plans; event public.cp_monitor_daily_events; initial public.cp_monitor_daily_events; next_status text;
begin
 select * into event from public.cp_monitor_daily_events where id=p_event_id;
 if event.id is null then raise exception 'Laporan harian tidak ditemukan.'; end if;
 ctx:=public.cp_monitor_daily_context(event.order_ref,event.employee_code,p_actor_id);
 select * into plan from public.cp_monitor_daily_plans where order_ref=event.order_ref for update;
 select * into event from public.cp_monitor_daily_events where id=p_event_id for update;
 if event.actor_id is distinct from p_actor_id or event.status<>'sending' or p_message_id is null or p_message_id<=0 or nullif(btrim(p_file_id),'') is null
  or event.sequence_no<>plan.revision+1 or event.cycle_id<>plan.cycle_id or event.day_no<>plan.completed_days+1
  or event.employee_id is distinct from ctx->>'employeeId' or event.chat_id is distinct from (ctx->>'chatId')::bigint then raise exception 'Bukti atau progres harian berubah.'; end if;
 update public.cp_monitor_daily_events set status='sent',telegram_message_id=p_message_id,telegram_file_id=p_file_id,sent_at=clock_timestamp() where id=event.id returning * into event;
 update public.cp_monitor_daily_plans set revision=event.sequence_no,completed_days=completed_days+case when event.action='done' then 1 else 0 end
  where order_ref=plan.order_ref returning * into plan;
 next_status:=case when event.action='done' then case when plan.completed_days=plan.total_days then 'completed' else 'assigned' end else 'in_progress' end;
 update public.cp_fh3_monitor_jobs set status=next_status,started_at=case when event.action='start' then coalesce(started_at,event.sent_at) else started_at end,
  completed_at=case when next_status='completed' then event.sent_at else null end where order_ref=plan.order_ref;
 if next_status='completed' then
  -- Only the final day's confirmed DONE enters the existing completion/wage/Closing flow.
  select * into initial from public.cp_monitor_daily_events where order_ref=plan.order_ref and cycle_id=plan.cycle_id
   and day_no=event.day_no and action='start' and status='sent' order by sequence_no desc limit 1;
  if initial.id is null then raise exception 'START hari terakhir tidak ditemukan.'; end if;
  insert into public.cp_mobile_order_proof(order_ref,employee_code,action,actor_id,chat_id,chat_title,caption,reply_to_message_id,status,telegram_message_id,telegram_file_id,sent_at)
   values(plan.order_ref,initial.employee_code,'start',initial.actor_id,initial.chat_id,initial.chat_title,initial.caption,initial.reply_to_message_id,'sent',initial.telegram_message_id,initial.telegram_file_id,initial.sent_at),
   (plan.order_ref,event.employee_code,'done',event.actor_id,event.chat_id,event.chat_title,event.caption,event.reply_to_message_id,'sent',event.telegram_message_id,event.telegram_file_id,event.sent_at);
 end if;
 return jsonb_build_object('ok',true,'caption',event.caption,'chatTitle',event.chat_title,'status',next_status,'source','telegram_job',
  'dayNumber',event.day_no,'completedDays',plan.completed_days,'totalDays',plan.total_days,'dailyRevision',plan.revision);
end $$;

create function public.cp_monitor_daily_mark(p_event_id uuid,p_actor_id uuid,p_status text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_actor_id is null or p_status is null or p_status not in ('failed','unknown') then return false; end if;
 update public.cp_monitor_daily_events set status=p_status where id=p_event_id and actor_id=p_actor_id and status='sending';return found;
end $$;

-- Old clients cannot turn a partial daily report into a final order DONE.
alter function public.cp_mobile_proof_begin(text,text,text,uuid) rename to cp_monitor_proof_before_daily;
revoke all on function public.cp_monitor_proof_before_daily(text,text,text,uuid) from public,anon,authenticated,service_role;
create function public.cp_mobile_proof_begin(p_order_ref text,p_employee_code text,p_action text,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.cp_monitor_daily_plans where order_ref=upper(btrim(p_order_ref))) then raise exception 'Order harian memerlukan aplikasi terbaru dan nomor day yang sedang dikerjakan.'; end if;
 return public.cp_monitor_proof_before_daily(p_order_ref,p_employee_code,p_action,p_actor_id);
end $$;

alter function public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text) rename to cp_monitor_manage_before_daily;
revoke all on function public.cp_monitor_manage_before_daily(uuid,text,bigint,text,text,text,bigint,text) from public,anon,authenticated,service_role;
create function public.cp_monitor_manage_order(p_actor uuid,p_ref text,p_version bigint,p_action text,p_reason text,p_state text default null,p_wage bigint default null,p_employee text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; plan public.cp_monitor_daily_plans; receipt public.cp_fh3_telegram_manual_orders; parsed jsonb; initialize_daily boolean:=false;
begin
 perform public.cp_monitor_assert_actor(p_actor,null,true);perform public.cp_monitor_lock_order(p_ref);
 select * into plan from public.cp_monitor_daily_plans where order_ref=p_ref for update;
 if exists(select 1 from public.cp_monitor_daily_events where order_ref=p_ref and status in ('sending','unknown')) then
  raise exception 'Laporan harian belum pasti. Rekonsiliasi sebelum mengubah order.'; end if;
 -- Admin assignment of an untouched queue item must use the same future-day rules as TAKE.
 if p_action='transfer' and plan.order_ref is null
  and not exists(select 1 from public.cp_fh3_monitor_jobs where order_ref=p_ref)
  and not exists(select 1 from public.cp_mobile_order_take where order_ref=p_ref)
  and not exists(select 1 from public.cp_mobile_order_proof where order_ref=p_ref) then
  select * into receipt from public.cp_fh3_telegram_manual_orders where order_ref=p_ref;
  parsed:=public.cp_monitor_duration(receipt.duration);
  if (parsed->>'durationNeedsReview')::boolean then raise exception 'Duration tidak jelas. Koreksi durasi sebelum penugasan.'; end if;
  initialize_daily:=(parsed->>'daily')::boolean;
 end if;
 result:=public.cp_monitor_manage_before_daily(p_actor,p_ref,p_version,p_action,p_reason,p_state,p_wage,p_employee);
 if initialize_daily then
  insert into public.cp_monitor_daily_plans(order_ref,duration,source_message_id,total_days,hours_per_day)
  values(p_ref,left(receipt.duration,200),receipt.message_id,(parsed->>'totalDays')::integer,(parsed->>'hoursPerDay')::numeric);
 elsif p_action='transfer' and plan.order_ref is not null and plan.completed_days<plan.total_days then
  update public.cp_monitor_daily_plans set cycle_id=gen_random_uuid(),revision=revision+1 where order_ref=p_ref;
 end if;
 return result;
end $$;

revoke all on function public.cp_monitor_duration(text),public.cp_monitor_daily_context(text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.cp_mobile_assign_fh3(text,text,uuid),public.cp_mobile_proof_begin(text,text,text,uuid),
 public.cp_monitor_daily_states(text[]),public.cp_monitor_daily_begin(text,text,text,uuid,integer,bigint,uuid),
 public.cp_monitor_daily_finish(uuid,uuid,bigint,text),public.cp_monitor_daily_mark(uuid,uuid,text),
 public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.cp_mobile_assign_fh3(text,text,uuid),public.cp_mobile_proof_begin(text,text,text,uuid),
 public.cp_monitor_daily_states(text[]),public.cp_monitor_daily_begin(text,text,text,uuid,integer,bigint,uuid),
 public.cp_monitor_daily_finish(uuid,uuid,bigint,text),public.cp_monitor_daily_mark(uuid,uuid,text),
 public.cp_monitor_manage_order(uuid,text,bigint,text,text,text,bigint,text) to service_role;
