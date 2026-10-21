-- FH3 manual Telegram intake is staging metadata, NOT a Payroll sale or payout.
-- No raw message, photo, login ID, or password is persisted.
create table if not exists public.cp_fh3_telegram_manual_orders (
  order_ref text primary key check (order_ref ~ '^X[0-9]{2,12}$'),
  chat_id bigint not null check (chat_id < 0),
  message_id bigint not null check (message_id > 0),
  admin_user_id bigint not null check (admin_user_id > 0),
  game text not null default '',
  server_name text not null default '',
  duration text not null default '',
  task text not null check (length(task) between 1 and 400),
  posted_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  unique (chat_id, message_id)
);
create index if not exists cp_fh3_manual_orders_recent_idx
  on public.cp_fh3_telegram_manual_orders(posted_at desc);

alter table public.cp_fh3_telegram_manual_orders enable row level security;
revoke all on public.cp_fh3_telegram_manual_orders from public, anon, authenticated;
grant select, insert, update on public.cp_fh3_telegram_manual_orders to service_role;

-- Telegram retries and edit updates are idempotent. Older messages may not
-- replace a later message for the same order. The authenticated webhook
-- verifies the sender is an administrator of the bound FH3 group first.
create or replace function public.cp_fh3_telegram_save_manual(
  p_order_ref text,
  p_chat_id bigint,
  p_message_id bigint,
  p_admin_user_id bigint,
  p_game text,
  p_server_name text,
  p_duration text,
  p_task text,
  p_posted_at timestamptz
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  changed integer;
begin
  if p_order_ref !~ '^X[0-9]{2,12}$' or p_chat_id >= 0
    or p_message_id <= 0 or p_admin_user_id <= 0
    or nullif(btrim(p_task),'') is null or length(p_task)>400
    or p_posted_at is null then
    raise exception 'Data pesan FH3 tidak valid';
  end if;
  -- Re-validate the group in the same transaction; a stale webhook may
  -- not store an order after an admin rebinds FH3 to a different group.
  if not exists (
    select 1 from public.cp_payroll_telegram_divisions
    where division='FH3' and active and chat_id=p_chat_id
  ) then
    raise exception 'Pesan bukan dari grup FH3 yang aktif';
  end if;
  insert into public.cp_fh3_telegram_manual_orders
    (order_ref,chat_id,message_id,admin_user_id,game,server_name,duration,task,posted_at)
  values
    (p_order_ref,p_chat_id,p_message_id,p_admin_user_id,
     left(p_game,150),left(p_server_name,150),left(p_duration,80),p_task,p_posted_at)
  on conflict(order_ref) do update set
    message_id=excluded.message_id,admin_user_id=excluded.admin_user_id,
    game=excluded.game,server_name=excluded.server_name,duration=excluded.duration,
    task=excluded.task,posted_at=excluded.posted_at,received_at=clock_timestamp()
  where public.cp_fh3_telegram_manual_orders.chat_id=excluded.chat_id
    and excluded.message_id>=public.cp_fh3_telegram_manual_orders.message_id;
  get diagnostics changed=row_count;
  return changed>0;
end;
$$;
revoke all on function public.cp_fh3_telegram_save_manual(
  text,bigint,bigint,bigint,text,text,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.cp_fh3_telegram_save_manual(
  text,bigint,bigint,bigint,text,text,text,text,timestamptz
) to service_role;
