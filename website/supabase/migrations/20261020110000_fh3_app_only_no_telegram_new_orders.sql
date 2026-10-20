-- Operational directive: FH3 order arrival and TAKE ORDER live in EVOGAMING Monitor,
-- not the EVO Ilham FH3 Telegram group. Preserve outbound START/DONE photo proofs.
-- Fix previously allowed GOLD cards in addition to Boosting/Item.
-- Preserve running legacy Telegram sessions and all other divisions unchanged.
do $migration$
declare
  existing_def text;
  before_guard constant text := 'if p_order->>''team''=''FH3'' and p_order->>''orderType'' in (''boosting'',''item'')';
  after_guard constant text := 'if p_order->>''team''=''FH3'' and p_order->>''orderType'' in (''boosting'',''item'',''gold'')';
begin
  existing_def := pg_get_functiondef('public.cp_telegram_prepare_order(jsonb,jsonb)'::regprocedure);
  if position(before_guard in existing_def) > 0 then
    execute replace(existing_def, before_guard, after_guard);
  elsif position(after_guard in existing_def) = 0 then
    raise exception 'Unexpected Telegram order preparation routine; refusing unsafe migration';
  end if;
end
$migration$;

-- Fail closed for INITIAL FH3 order notices, even if another route or a stale
-- worker attempts to enqueue dispatch cards. Does not affect Telegram proofs,
-- group binding, START/DONE uploads, or legacy active work progress events.
create or replace function public.cp_telegram_block_fh3_new_order_dispatch()
returns trigger language plpgsql security definer set search_path='' as $guard$
begin
  if new.event_key like 'dispatch:%' and exists (
    select 1 from public.cp_payroll_telegram_orders o
    where o.order_ref=new.order_ref and o.division='FH3'
      and o.order_type in ('gold','boosting','item')
      and o.state in ('waiting','assigned')
  ) then
    return null;
  end if;
  return new;
end
$guard$;

do $migration$
begin
  if not exists(
    select 1 from pg_trigger
    where tgrelid='public.cp_payroll_telegram_outbox'::regclass
      and tgname='cp_telegram_block_fh3_new_order_dispatch_trigger'
      and not tgisinternal
  ) then
    create trigger cp_telegram_block_fh3_new_order_dispatch_trigger
      before insert on public.cp_payroll_telegram_outbox
      for each row execute function public.cp_telegram_block_fh3_new_order_dispatch();
  end if;
end
$migration$;

-- Only purge UNSENT initial dispatches. Never remove order records, existing
-- Telegram chat messages, photos, or anything from other divisions.
update public.cp_payroll_telegram_outbox b
set status='cancelled'
from public.cp_payroll_telegram_orders o
where o.order_ref=b.order_ref and o.division='FH3'
  and o.order_type in ('gold','boosting','item')
  and o.state in ('waiting','assigned')
  and b.event_key like 'dispatch:%'
  and b.status in ('pending','uncertain');
