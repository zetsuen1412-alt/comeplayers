-- Direct FH3 Boosting/Item routing: stop new Telegram dispatches, preserve legacy active work.
-- This replaces ONLY the order-preparation function; other divisions and Gold behavior are unchanged.
create or replace function public.cp_telegram_prepare_order(p_order jsonb, p_workspace jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.cp_payroll_telegram_orders; d record; ref text:=p_order->>'externalReference'; terminal boolean; requested jsonb; chosen public.cp_payroll_telegram_employees;
begin
  if ref is null then return; end if;
  -- New FH3 Boosting/Item orders belong to CP Boost Monitor, never Telegram.
  -- Keep an already in-progress legacy Telegram job operational until completion.
  if p_order->>'team'='FH3' and p_order->>'orderType' in ('boosting','item')
    and not exists (
      select 1 from public.cp_payroll_telegram_orders previous
      where previous.order_ref=ref and previous.state in
        ('in_progress','paused','problem','done_pending_admin')
    ) then return; end if;
  -- Website archives are inactive, not verified; explicit restoration resumes the prior workflow.
  if nullif(p_order->>'websiteDeletedAt','') is not null then return; end if;
  terminal:=public.cp_telegram_terminal(p_order,p_workspace);
  select * into o from public.cp_payroll_telegram_orders where order_ref=ref for update;
  if terminal then
    if o.order_ref is not null and o.state<>'verified' then
      update public.cp_payroll_telegram_orders set state='verified',updated_at=now(),last_event_at=now() where order_ref=ref;
      update public.cp_payroll_telegram_sessions set closed_at=now() where order_ref=ref and closed_at is null;
      insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload)
        select 'verified:'||ref||':'||chat_id,ref,chat_id,
          jsonb_build_object('text',E'✅ ORDER DIVERIFIKASI ADMIN\nOrder : '||ref||E'\n✅ SELESAI. Tidak ada aksi lain yang diperbolehkan.')
        from public.cp_payroll_telegram_order_chats where order_ref=ref and public.cp_telegram_route_allowed(order_ref,division,chat_id) on conflict do nothing;
    end if;
    return;
  end if;
  if nullif(p_order->>'sheetDeletedAt','') is not null or coalesce(p_order->>'orderType','') not in ('gold','boosting','item') then return; end if;
  insert into public.cp_payroll_telegram_orders(order_ref,order_type,target_quantity,division)
    values(ref,p_order->>'orderType',case when p_order->>'orderType' in ('gold','item') then greatest(coalesce((p_order->>'quantity')::numeric,0),0) else 1 end,p_order->>'team')
    on conflict(order_ref) do update set
      division=excluded.division,
      -- Never reclassify work in progress or reduce a quota below accepted contributions.
      order_type=case when cp_payroll_telegram_orders.state='waiting' then excluded.order_type else cp_payroll_telegram_orders.order_type end,
      target_quantity=greatest(excluded.target_quantity,cp_payroll_telegram_orders.delivered_quantity),updated_at=now()
    returning * into o;
  if o.state='verified' then return; end if;
  perform public.cp_telegram_refresh_roster(p_workspace);
  -- Honor one explicitly requested Boosting/Item worker without requiring that worker's Telegram.
  if o.order_type in ('boosting','item') and o.state='waiting' and p_order->>'assignmentMode'='direct'
    and jsonb_array_length(coalesce(p_order->'workerAssignments','[]'))=1 then
    requested:=p_order->'workerAssignments'->0;
    select * into chosen from public.cp_payroll_telegram_employees
      where employee_code=requested->>'employeeCode' and division=o.division and active;
    if chosen.employee_code is not null then
      insert into public.cp_payroll_telegram_assignments(order_ref,employee_code,division,telegram_user_id)
        values(ref,chosen.employee_code,chosen.division,chosen.telegram_user_id);
      update public.cp_payroll_telegram_orders set state='assigned' where order_ref=ref returning * into o;
    end if;
  end if;
  update public.cp_payroll_telegram_orders set dispatch_status=case
    when coalesce(o.division,'') not in ('FH1','FH2','FH3','ADMIN','BANDAR') or (o.order_type='gold' and o.division not in ('FH1','FH2','FH3')) then 'waiting_division' else 'pending' end where order_ref=ref;
  for d in select * from public.cp_payroll_telegram_divisions where active and division=o.division
    and (o.order_type<>'gold' or division in ('FH1','FH2','FH3')) loop
    insert into public.cp_payroll_telegram_order_chats(order_ref,division,chat_id) values(ref,d.division,d.chat_id)
      on conflict(order_ref,division) do update set chat_id=excluded.chat_id,message_id=null
      where cp_payroll_telegram_order_chats.chat_id<>excluded.chat_id;
    -- Existing successful foundation dispatches must not be resent by this migration.
    if exists(select 1 from public.cp_payroll_telegram_order_chats where order_ref=ref and division=d.division and message_id is not null) then continue; end if;
    insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload)
        values('dispatch:'||ref||':'||d.chat_id,ref,d.chat_id,jsonb_build_object(
        'text',case when o.order_type='gold' then '🪙 ORDER GOLD' when o.order_type='item' then '📦 ORDER ITEM' else '🎮 ORDER BOOSTING' end
          ||E'\nOrder : '||ref||E'\nNama : '||coalesce(p_order->>'orderName',p_order->>'service','—')
          ||E'\nGame : '||coalesce(p_order->>'gameName',p_order->>'game','—')||E'\nDivisi : '||d.division
          ||E'\nKaryawan : '||coalesce(nullif((select string_agg(a->>'employeeName',', ') from jsonb_array_elements(coalesce(p_order->'workerAssignments','[]')) a),''),'Ditentukan leader')
          ||E'\nTarget : '||o.target_quantity||E'\nTASK : '||coalesce(p_order->>'task','—'),
        'keyboard',o.order_type,'orderId',o.callback_id)) on conflict do nothing;
  end loop;
end;
$$;

-- Pending unsent notices from old FH3 Boosting/Item orders must not leave via Telegram.
-- Legacy work already started is preserved and may still finish via its original flow.
update public.cp_payroll_telegram_outbox b
set status='cancelled'
from public.cp_payroll_telegram_orders o
where b.order_ref=o.order_ref
  and o.division='FH3' and o.order_type in ('boosting','item')
  and o.state in ('waiting','assigned')
  and b.status='pending';
