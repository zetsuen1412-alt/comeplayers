-- CP Boost Monitor FH3: atomic mobile assignment, separate from Telegram update IDs.
-- Deliberately limited to one not-yet-started Boosting/Item worker per order.
create function public.cp_mobile_assign_fh3(p_order_ref text, p_employee_code text, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w jsonb;
  item jsonb;
  employee jsonb;
  o public.cp_payroll_telegram_orders;
  assigned_code text;
begin
  if p_actor_id is null or nullif(btrim(p_order_ref), '') is null
    or nullif(btrim(p_employee_code), '') is null then
    raise exception 'Order, karyawan, dan pelaku harus diisi.';
  end if;

  -- Lock order always AFTER workspace (same order as Telegram webhook RPC).
  select payload into w from public.cp_payroll_workspace where id = 1 for update;
  if w is null then raise exception 'Payroll workspace tidak tersedia.'; end if;
  select * into o from public.cp_payroll_telegram_orders
    where lower(order_ref) = lower(btrim(p_order_ref)) for update;
  if o.order_ref is null then raise exception 'Order Telegram tidak ditemukan.'; end if;
  select value into item
    from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3', '[]'::jsonb))
    where lower(value->>'externalReference') = lower(o.order_ref);
  if item is null or o.division <> 'FH3' or item->>'team' <> 'FH3'
    or o.order_type not in ('boosting','item') or item->>'orderType' <> o.order_type
    or nullif(item->>'sheetDeletedAt', '') is not null
    or nullif(item->>'websiteDeletedAt', '') is not null
    or item->>'operationalStatus' = 'cancelled'
    or public.cp_telegram_terminal(item, w) then
    raise exception 'Order tidak aktif atau bukan Boosting/Item FH3.';
  end if;

  select value into employee
    from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2', '[]'::jsonb))
    where upper(value->>'code') = upper(btrim(p_employee_code))
      and value->>'team' = 'FH3'
      and coalesce(value->>'workforceStatus', 'SHIFT') in ('NEW', 'SHIFT', 'FULL')
      and nullif(value->>'sheetRosterMissingAt', '') is null;
  if employee is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;

  if o.state = 'assigned' then
    select employee_code into assigned_code from public.cp_payroll_telegram_assignments
      where order_ref = o.order_ref and status = 'assigned' limit 1;
    if assigned_code = employee->>'code' then
      return jsonb_build_object('ok', true, 'alreadyAssigned', true, 'orderRef', o.order_ref,
        'employeeCode', assigned_code, 'employeeName', employee->>'name');
    end if;
  end if;
  if o.state <> 'waiting' or exists (
    select 1 from public.cp_payroll_telegram_assignments
      where order_ref=o.order_ref and status in ('assigned','in_progress','paused','problem')
  ) then
    raise exception 'Order sudah ditugaskan atau dikerjakan. Muat ulang daftar order.';
  end if;

  -- No Telegram identity impersonation; employee assignment uses trusted website roster.
  perform public.cp_telegram_refresh_roster(w);
  insert into public.cp_payroll_telegram_assignments
    (order_ref,employee_code,division,telegram_user_id)
    select o.order_ref, employee->>'code', 'FH3', t.telegram_user_id
    from (select 1) n left join public.cp_payroll_telegram_employees t
      on t.employee_code=employee->>'code' and t.division='FH3' and t.active;
  update public.cp_payroll_telegram_orders
    set state='assigned', updated_at=now(), last_event_at=now()
    where order_ref=o.order_ref;
  -- Existing helper increments revision and syncs the website Mutasi worker.
  perform public.cp_telegram_save_worker(o.order_ref, employee);
  insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload)
    select 'mobile-assigned:'||o.order_ref||':'||c.chat_id,o.order_ref,c.chat_id,
      jsonb_build_object('text', '✅ Karyawan ditentukan melalui CP Boost Monitor oleh admin website.',
        'keyboard',o.order_type,'orderId',o.callback_id)
    from public.cp_payroll_telegram_order_chats c
    join public.cp_payroll_telegram_divisions d
      on d.division=c.division and d.chat_id=c.chat_id and d.active
    where c.order_ref=o.order_ref and c.division='FH3' and c.message_id is not null
    on conflict(event_key) do nothing;
  return jsonb_build_object('ok', true, 'alreadyAssigned', false, 'orderRef', o.order_ref,
    'employeeCode', employee->>'code', 'employeeName', employee->>'name');
end;
$$;

revoke all on function public.cp_mobile_assign_fh3(text,text,uuid) from public, anon, authenticated;
grant execute on function public.cp_mobile_assign_fh3(text,text,uuid) to service_role;
