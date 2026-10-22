-- Operational work without creating a Payroll sale or inventing a salary/rate.
create table public.cp_fh3_monitor_jobs (
  order_ref text primary key references public.cp_fh3_telegram_manual_orders(order_ref),
  chat_id bigint not null check(chat_id<0), source_message_id bigint not null check(source_message_id>0),
  employee_id text not null, employee_code text not null, employee_name text not null,
  actor_id uuid not null, status text not null default 'assigned' check(status in ('assigned','in_progress','completed')),
  created_at timestamptz not null default clock_timestamp(), started_at timestamptz, completed_at timestamptz
);
create index cp_fh3_jobs_worker_idx on public.cp_fh3_monitor_jobs(employee_code,created_at desc);
alter table public.cp_fh3_monitor_jobs enable row level security;
revoke all on public.cp_fh3_monitor_jobs from public,anon,authenticated;
grant select,insert,update on public.cp_fh3_monitor_jobs to service_role;

-- Existing work retains its stable employee identity even before a sale is entered.
create function public.cp_fh3_jobs_preserve_employee() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.cp_fh3_monitor_jobs j where not exists(
   select 1 from jsonb_array_elements(coalesce(new.payload->'cp-ofs-demo-employees-v2','[]'::jsonb)) e
   where e->>'id'=j.employee_id and e->>'code'=j.employee_code)) then
   raise exception 'Identitas karyawan memiliki riwayat pekerjaan Monitor dan harus dipertahankan.';
 end if;
 return new;
end;
$$;
revoke all on function public.cp_fh3_jobs_preserve_employee() from public,anon,authenticated,service_role;
create trigger cp_fh3_jobs_employee_guard before update of payload on public.cp_payroll_workspace
 for each row execute function public.cp_fh3_jobs_preserve_employee();

create function public.cp_fh3_job_context(p_ref text,p_code text,p_require_job boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare dest public.cp_payroll_telegram_divisions; receipt public.cp_fh3_telegram_manual_orders;
 job public.cp_fh3_monitor_jobs; w jsonb; emp jsonb; matches integer; code text;
begin
 if p_ref is null or upper(btrim(p_ref)) !~ '^X[0-9]{2,12}$' then raise exception 'Kode order tidak valid.'; end if;
 select * into dest from public.cp_payroll_telegram_divisions where division='FH3' and active for share;
 select * into receipt from public.cp_fh3_telegram_manual_orders
   where order_ref=upper(btrim(p_ref)) and active and chat_id=dest.chat_id and admin_user_id=dest.fh3_order_sender_id for share;
 if receipt.order_ref is null then raise exception 'Order tidak tercatat dari pesan admin aktif di grup Telegram FH3.'; end if;
 select payload into w from public.cp_payroll_workspace where id=1 for update;
 if w is null then raise exception 'Payroll tidak ditemukan.'; end if;
 select * into job from public.cp_fh3_monitor_jobs where order_ref=receipt.order_ref for update;
 if p_require_job and job.order_ref is null then raise exception 'Pekerjaan Monitor tidak ditemukan.'; end if;
 code:=coalesce(job.employee_code,btrim(p_code));
 if p_code is null or upper(btrim(p_code)) is distinct from upper(code) then raise exception 'Karyawan tidak cocok.'; end if;
 select value into emp from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]'::jsonb)) value
   where upper(value->>'code')=upper(code) and value->>'team'='FH3'
     and value->>'workforceStatus' in ('NEW','SHIFT','FULL') and nullif(value->>'sheetRosterMissingAt','') is null;
 if emp is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;
 if job.order_ref is not null and (job.chat_id<>dest.chat_id or job.employee_id is distinct from emp->>'id') then
   raise exception 'Identitas atau grup pekerjaan berubah. Perlu rekonsiliasi admin.';
 end if;
 select count(*) into matches from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) value
   where upper(btrim(value->>'externalReference'))=receipt.order_ref;
 if matches>1 then raise exception 'Referensi order Payroll ambigu.'; end if;
 if exists(select 1 from public.cp_mobile_order_take t where upper(t.order_ref)=receipt.order_ref
      and (t.chat_id<>dest.chat_id or t.employee_code is distinct from emp->>'code'))
   or exists(select 1 from public.cp_mobile_order_proof p where upper(p.order_ref)=receipt.order_ref
      and (p.chat_id<>dest.chat_id or p.employee_code is distinct from emp->>'code')) then
   raise exception 'Grup atau karyawan berbeda dari laporan Telegram sebelumnya.';
 end if;
 return jsonb_build_object('orderRef',receipt.order_ref,'chatId',dest.chat_id,'chatTitle',dest.chat_title,
   'sourceMessageId',receipt.message_id,'employeeId',emp->>'id','employeeCode',emp->>'code',
   'employeeName',emp->>'name','jobExists',job.order_ref is not null,'status',job.status,'payrollMatches',matches);
end;
$$;
revoke all on function public.cp_fh3_job_context(text,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.cp_mobile_assign_fh3(p_order_ref text,p_employee_code text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb;
begin
 if p_actor_id is null then raise exception 'Aktor tidak valid.'; end if;
 ctx:=public.cp_fh3_job_context(p_order_ref,p_employee_code,false);
 if not (ctx->>'jobExists')::boolean and (ctx->>'payrollMatches')::integer=1 then
   perform public.cp_fh3_require_manual(p_order_ref);
   return public.cp_mobile_assign_fh3_payroll_source(p_order_ref,p_employee_code,p_actor_id);
 end if;
 if not (ctx->>'jobExists')::boolean then
   insert into public.cp_fh3_monitor_jobs(order_ref,chat_id,source_message_id,employee_id,employee_code,employee_name,actor_id)
   values(ctx->>'orderRef',(ctx->>'chatId')::bigint,(ctx->>'sourceMessageId')::bigint,
     ctx->>'employeeId',ctx->>'employeeCode',ctx->>'employeeName',p_actor_id);
   insert into public.cp_mobile_assignment_audit(order_ref,employee_code,actor_id)
   values(ctx->>'orderRef',ctx->>'employeeCode',p_actor_id);
 end if;
 return jsonb_build_object('ok',true,'orderRef',ctx->>'orderRef','employeeCode',ctx->>'employeeCode',
   'employeeName',ctx->>'employeeName','source','telegram_job','alreadyAssigned',(ctx->>'jobExists')::boolean);
end;
$$;

create or replace function public.cp_mobile_take_begin(p_order_ref text,p_employee_code text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; r public.cp_mobile_order_take; caption text; slug text;
begin
 if not exists(select 1 from public.cp_fh3_monitor_jobs where order_ref=upper(btrim(p_order_ref))) then
   perform public.cp_fh3_require_manual(p_order_ref);
   return public.cp_mobile_take_begin_payroll_source(p_order_ref,p_employee_code,p_actor_id);
 end if;
 if p_actor_id is null then raise exception 'Aktor tidak valid.'; end if;
 ctx:=public.cp_fh3_job_context(p_order_ref,p_employee_code,true);
 if ctx->>'status' not in ('assigned','in_progress') then raise exception 'Pekerjaan sudah selesai.'; end if;
 select * into r from public.cp_mobile_order_take where order_ref=ctx->>'orderRef' for update;
 if r.status='sent' then return jsonb_build_object('ok',true,'alreadySent',true,'caption',r.caption,
   'chatTitle',r.chat_title,'messageId',r.telegram_message_id); end if;
 if r.status in ('sending','unknown') then raise exception 'TAKE belum pasti. Periksa grup, jangan kirim ulang.'; end if;
 if ctx->>'status'<>'assigned' then raise exception 'TAKE harus sebelum START.'; end if;
 slug:=btrim(regexp_replace(lower(ctx->>'employeeName'),'[^a-z0-9]+','-','g'),'-');
 if slug='' then raise exception 'Nama karyawan tidak valid.'; end if;
 caption:=lower(ctx->>'orderRef')||'/'||left(slug,65)||'/take';
 if r.id is null then
   insert into public.cp_mobile_order_take(order_ref,employee_code,actor_id,chat_id,chat_title,caption)
   values(ctx->>'orderRef',ctx->>'employeeCode',p_actor_id,(ctx->>'chatId')::bigint,ctx->>'chatTitle',caption) returning * into r;
 else
   update public.cp_mobile_order_take set status='sending',actor_id=p_actor_id where id=r.id returning * into r;
 end if;
 return jsonb_build_object('ok',true,'alreadySent',false,'eventId',r.id,'caption',r.caption,'chatId',r.chat_id,'chatTitle',r.chat_title);
end;
$$;

create or replace function public.cp_mobile_proof_begin(p_order_ref text,p_employee_code text,p_action text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; r public.cp_mobile_order_proof; take_id bigint; start_id bigint; reply_id bigint; caption text; slug text;
begin
 if not exists(select 1 from public.cp_fh3_monitor_jobs where order_ref=upper(btrim(p_order_ref))) then
   perform public.cp_fh3_require_manual(p_order_ref);
   return public.cp_mobile_proof_begin_payroll_source(p_order_ref,p_employee_code,p_action,p_actor_id);
 end if;
 if p_actor_id is null or p_action is null or p_action not in ('start','done') then raise exception 'Aksi tidak valid.'; end if;
 ctx:=public.cp_fh3_job_context(p_order_ref,p_employee_code,true);
 select telegram_message_id into take_id from public.cp_mobile_order_take
   where order_ref=ctx->>'orderRef' and status='sent' and chat_id=(ctx->>'chatId')::bigint;
 if take_id is null then raise exception 'Kirim TAKE ke Telegram terlebih dahulu sebelum START.'; end if;
 select telegram_message_id into start_id from public.cp_mobile_order_proof
   where order_ref=ctx->>'orderRef' and action='start' and status='sent' and chat_id=(ctx->>'chatId')::bigint;
 select * into r from public.cp_mobile_order_proof where order_ref=ctx->>'orderRef' and action=p_action for update;
 if r.status='sent' then return jsonb_build_object('ok',true,'alreadySent',true,'caption',r.caption,'chatTitle',r.chat_title); end if;
 if r.status in ('sending','unknown') then raise exception 'Pengiriman belum pasti. Periksa grup; jangan kirim ulang.'; end if;
 if (p_action='start' and ctx->>'status'<>'assigned')
   or (p_action='done' and (ctx->>'status'<>'in_progress' or start_id is null)) then
   raise exception 'Urutan pekerjaan harus TAKE, START, lalu DONE.';
 end if;
 slug:=btrim(regexp_replace(lower(ctx->>'employeeName'),'[^a-z0-9]+','-','g'),'-');
 if slug='' then raise exception 'Nama karyawan tidak valid.'; end if;
 caption:=lower(ctx->>'orderRef')||'/'||left(slug,65)||'/'||p_action;
 reply_id:=case when p_action='start' then take_id else start_id end;
 if r.id is null then
   insert into public.cp_mobile_order_proof(order_ref,employee_code,action,actor_id,chat_id,chat_title,caption,reply_to_message_id)
   values(ctx->>'orderRef',ctx->>'employeeCode',p_action,p_actor_id,(ctx->>'chatId')::bigint,ctx->>'chatTitle',caption,reply_id) returning * into r;
 else
   update public.cp_mobile_order_proof set status='sending',actor_id=p_actor_id where id=r.id returning * into r;
 end if;
 return jsonb_build_object('ok',true,'alreadySent',false,'eventId',r.id,'chatId',r.chat_id,
   'chatTitle',r.chat_title,'caption',r.caption,'replyToMessageId',r.reply_to_message_id);
end;
$$;

alter function public.cp_mobile_proof_finish(uuid,uuid,bigint,text) rename to cp_mobile_proof_finish_payroll_source;
revoke all on function public.cp_mobile_proof_finish_payroll_source(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
create function public.cp_mobile_proof_finish(p_event_id uuid,p_actor_id uuid,p_message_id bigint,p_file_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cp_mobile_order_proof; ctx jsonb; next_status text;
begin
 select * into r from public.cp_mobile_order_proof where id=p_event_id;
 if not exists(select 1 from public.cp_fh3_monitor_jobs where order_ref=r.order_ref) then
   return public.cp_mobile_proof_finish_payroll_source(p_event_id,p_actor_id,p_message_id,p_file_id);
 end if;
 ctx:=public.cp_fh3_job_context(r.order_ref,r.employee_code,true);
 select * into r from public.cp_mobile_order_proof where id=p_event_id for update;
 if p_actor_id is null or r.actor_id is distinct from p_actor_id or r.status<>'sending'
   or p_message_id is null or p_message_id<=0 or nullif(btrim(p_file_id),'') is null then raise exception 'Bukti belum terkonfirmasi.'; end if;
 if (r.action='start' and ctx->>'status'<>'assigned') or (r.action='done' and ctx->>'status'<>'in_progress') then
   raise exception 'Status pekerjaan sudah berubah. Perlu rekonsiliasi admin.';
 end if;
 next_status:=case when r.action='start' then 'in_progress' else 'completed' end;
 update public.cp_fh3_monitor_jobs set status=next_status,
   started_at=case when r.action='start' then clock_timestamp() else started_at end,
   completed_at=case when r.action='done' then clock_timestamp() else completed_at end where order_ref=r.order_ref;
 update public.cp_mobile_order_proof set status='sent',telegram_message_id=p_message_id,
   telegram_file_id=p_file_id,sent_at=clock_timestamp() where id=p_event_id;
 return jsonb_build_object('ok',true,'status',next_status,'caption',r.caption,'chatTitle',r.chat_title,'source','telegram_job');
end;
$$;
revoke all on function public.cp_mobile_proof_finish(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.cp_mobile_proof_finish(uuid,uuid,bigint,text) to service_role;
