-- Unreleased FH3 operational receipts only. No Payroll sale, payout or raw caption.
create table public.cp_fh3_telegram_manual_orders (
  order_ref text primary key check (order_ref ~ '^X[0-9]{2,12}$'),
  chat_id bigint not null check (chat_id < 0),
  message_id bigint not null check (message_id > 0),
  admin_user_id bigint not null check (admin_user_id > 0),
  game text not null default '', server_name text not null default '',
  duration text not null default '', task text not null,
  active boolean not null default true,
  posted_at timestamptz not null, version_at timestamptz not null,
  update_id bigint not null check (update_id >= 0),
  received_at timestamptz not null default clock_timestamp(),
  check (length(task) <= 400 and (not active or length(btrim(task)) > 0))
);
create index cp_fh3_manual_orders_source_idx
  on public.cp_fh3_telegram_manual_orders(chat_id,message_id);
alter table public.cp_fh3_telegram_manual_orders enable row level security;
revoke all on public.cp_fh3_telegram_manual_orders from public,anon,authenticated;
grant select,insert,update on public.cp_fh3_telegram_manual_orders to service_role;

-- Authentication, actual group title and current sender administrator membership
-- are checked by the secret-authenticated webhook. This RPC rechecks binding and
-- orders receipts under locks, including edits that remove/change the order ref.
create function public.cp_fh3_telegram_save_manual(
  p_order_ref text,p_chat_id bigint,p_message_id bigint,p_admin_user_id bigint,
  p_game text,p_server_name text,p_duration text,p_task text,p_posted_at timestamptz,
  p_version_at timestamptz,p_update_id bigint,p_active boolean
) returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if p_chat_id is null or p_chat_id>=0 or p_message_id is null or p_message_id<=0
    or p_admin_user_id is null or p_admin_user_id<=0 or p_posted_at is null
    or p_version_at is null or p_version_at<p_posted_at
    or p_update_id is null or p_update_id<0 or p_active is null
    or (p_order_ref is not null and p_order_ref !~ '^X[0-9]{2,12}$')
    or (p_active and (p_order_ref is null or nullif(btrim(p_task),'') is null))
    or p_task is null or length(p_task)>400 then
    raise exception 'Data pesan FH3 tidak valid';
  end if;
  perform 1 from public.cp_payroll_telegram_divisions
    where division='FH3' and active and chat_id=p_chat_id for share;
  if not found then raise exception 'Pesan bukan dari grup FH3 yang aktif'; end if;
  -- Serialize edits and cancellation even when a new ref has no row to lock yet.
  perform pg_advisory_xact_lock(831983);
  update public.cp_fh3_telegram_manual_orders set active=false,task='',
    version_at=p_version_at,update_id=p_update_id,received_at=clock_timestamp()
    where chat_id=p_chat_id and message_id=p_message_id
      and (p_order_ref is null or order_ref<>p_order_ref)
      and (version_at,update_id)<(p_version_at,p_update_id);
  if p_order_ref is null then return found; end if;
  -- A cancellation creates a tombstone too: delayed delivery cannot revive it.
  insert into public.cp_fh3_telegram_manual_orders
    (order_ref,chat_id,message_id,admin_user_id,game,server_name,duration,task,
     active,posted_at,version_at,update_id)
  values(p_order_ref,p_chat_id,p_message_id,p_admin_user_id,
    left(coalesce(p_game,''),150),left(coalesce(p_server_name,''),150),
    left(coalesce(p_duration,''),80),p_task,p_active,p_posted_at,p_version_at,p_update_id)
  on conflict(order_ref) do update set
    chat_id=excluded.chat_id,message_id=excluded.message_id,admin_user_id=excluded.admin_user_id,
    game=excluded.game,server_name=excluded.server_name,duration=excluded.duration,
    task=excluded.task,active=excluded.active,posted_at=excluded.posted_at,
    version_at=excluded.version_at,update_id=excluded.update_id,received_at=clock_timestamp()
  where public.cp_fh3_telegram_manual_orders.chat_id<>excluded.chat_id
    or (excluded.message_id>=public.cp_fh3_telegram_manual_orders.message_id
      and (excluded.version_at,excluded.update_id)>
        (public.cp_fh3_telegram_manual_orders.version_at,public.cp_fh3_telegram_manual_orders.update_id));
  get diagnostics changed=row_count;
  return changed>0;
end;
$$;
revoke all on function public.cp_fh3_telegram_save_manual(
  text,bigint,bigint,bigint,text,text,text,text,timestamptz,timestamptz,bigint,boolean
) from public,anon,authenticated;
grant execute on function public.cp_fh3_telegram_save_manual(
  text,bigint,bigint,bigint,text,text,text,text,timestamptz,timestamptz,bigint,boolean
) to service_role;

-- Enforce the receipt in the same transaction as assignment/TAKE/photo claims.
-- Cached or legacy clients cannot bypass this by calling the action directly.
create function public.cp_fh3_require_manual(p_ref text) returns void
language plpgsql security invoker set search_path='' as $$
declare dest bigint; w jsonb; matches integer;
begin
  select chat_id into dest from public.cp_payroll_telegram_divisions
    where division='FH3' and active for share;
  perform 1 from public.cp_fh3_telegram_manual_orders
    where order_ref=upper(btrim(p_ref)) and chat_id=dest and active for share;
  if not found then raise exception 'Order tidak tercatat dari pesan admin aktif di grup Telegram FH3.'; end if;
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  select count(*) into matches from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) item
    where upper(btrim(item->>'externalReference'))=upper(btrim(p_ref));
  if matches=0 then raise exception 'Order tidak ditemukan.'; end if;
  if matches<>1 then raise exception 'Referensi order Payroll ambigu. Periksa duplikat sebelum melanjutkan.'; end if;
end;
$$;
revoke all on function public.cp_fh3_require_manual(text) from public,anon,authenticated,service_role;

alter function public.cp_mobile_assign_fh3(text,text,uuid) rename to cp_mobile_assign_fh3_payroll_source;
alter function public.cp_mobile_take_begin(text,text,uuid) rename to cp_mobile_take_begin_payroll_source;
alter function public.cp_mobile_proof_begin(text,text,text,uuid) rename to cp_mobile_proof_begin_payroll_source;
revoke all on function public.cp_mobile_assign_fh3_payroll_source(text,text,uuid),
  public.cp_mobile_take_begin_payroll_source(text,text,uuid),
  public.cp_mobile_proof_begin_payroll_source(text,text,text,uuid) from public,anon,authenticated,service_role;

create function public.cp_mobile_assign_fh3(p_order_ref text,p_employee_code text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.cp_fh3_require_manual(p_order_ref);
  return public.cp_mobile_assign_fh3_payroll_source(p_order_ref,p_employee_code,p_actor_id);
end;
$$;
create function public.cp_mobile_take_begin(p_order_ref text,p_employee_code text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.cp_fh3_require_manual(p_order_ref);
  return public.cp_mobile_take_begin_payroll_source(p_order_ref,p_employee_code,p_actor_id);
end;
$$;
create function public.cp_mobile_proof_begin(p_order_ref text,p_employee_code text,p_action text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.cp_fh3_require_manual(p_order_ref);
  return public.cp_mobile_proof_begin_payroll_source(p_order_ref,p_employee_code,p_action,p_actor_id);
end;
$$;
revoke all on function public.cp_mobile_assign_fh3(text,text,uuid),
  public.cp_mobile_take_begin(text,text,uuid),public.cp_mobile_proof_begin(text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.cp_mobile_assign_fh3(text,text,uuid),
  public.cp_mobile_take_begin(text,text,uuid),public.cp_mobile_proof_begin(text,text,text,uuid)
  to service_role;
