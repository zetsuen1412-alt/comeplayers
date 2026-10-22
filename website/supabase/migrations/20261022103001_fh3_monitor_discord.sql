-- Generated with `supabase migration new fh3_monitor_discord`.
-- Ordered after the existing 10:30 migration (its timestamp is ahead of the CLI clock).
-- Add only operational Discord metadata; never rewrite Payroll or historical receipts.
-- Apply before deploying the Discord-aware webhook and mobile APIs.
alter table public.cp_fh3_telegram_manual_orders
  add column discord text not null default '' check (length(discord) <= 150);

-- Keep the original RPC compatible with existing webhook deployments. This wrapper
-- extends the SAME transaction and locks; stale/cancel/foreign receipts cannot
-- update Discord separately from their verified source message.
create function public.cp_fh3_telegram_save_manual_with_discord(
  p_order_ref text,p_chat_id bigint,p_message_id bigint,p_admin_user_id bigint,
  p_game text,p_server_name text,p_duration text,p_task text,p_posted_at timestamptz,
  p_version_at timestamptz,p_update_id bigint,p_active boolean,p_sender_username text,
  p_discord text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare saved boolean;
begin
  if p_discord is null or length(p_discord)>150 then
    raise exception 'Discord FH3 tidak valid';
  end if;
  saved := public.cp_fh3_telegram_save_manual(
    p_order_ref,p_chat_id,p_message_id,p_admin_user_id,p_game,p_server_name,p_duration,
    p_task,p_posted_at,p_version_at,p_update_id,p_active,p_sender_username);
  if saved and p_active and p_order_ref is not null then
    update public.cp_fh3_telegram_manual_orders set discord=btrim(p_discord)
      where order_ref=p_order_ref and chat_id=p_chat_id and message_id=p_message_id
        and admin_user_id=p_admin_user_id and version_at=p_version_at and update_id=p_update_id;
  end if;
  return saved;
end;
$$;
revoke all on function public.cp_fh3_telegram_save_manual_with_discord(
  text,bigint,bigint,bigint,text,text,text,text,timestamptz,timestamptz,bigint,boolean,text,text
) from public,anon,authenticated;
grant execute on function public.cp_fh3_telegram_save_manual_with_discord(
  text,bigint,bigint,bigint,text,text,text,text,timestamptz,timestamptz,bigint,boolean,text,text
) to service_role;
notify pgrst, 'reload schema';
