-- Guard only: preserve Payroll, staff, money, Closing and existing delivery audit.
-- A group rebind or worker change cannot reuse a previous sender's TAKE/START.
create or replace function public.cp_fh3_require_manual(p_ref text) returns void
language plpgsql security invoker set search_path='' as $$
declare dest bigint; sender bigint; w jsonb; item jsonb; matches integer; code text;
begin
  select chat_id,fh3_order_sender_id into dest,sender from public.cp_payroll_telegram_divisions
    where division='FH3' and active for share;
  perform 1 from public.cp_fh3_telegram_manual_orders
    where order_ref=upper(btrim(p_ref)) and chat_id=dest and admin_user_id=sender and active for share;
  if not found then raise exception 'Order tidak tercatat dari pesan admin aktif di grup Telegram FH3.'; end if;
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  select count(*) into matches from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) value
    where upper(btrim(value->>'externalReference'))=upper(btrim(p_ref));
  if matches=0 then raise exception 'Order tidak ditemukan.'; end if;
  if matches<>1 then raise exception 'Referensi order Payroll ambigu. Periksa duplikat sebelum melanjutkan.'; end if;
  select value into item from jsonb_array_elements(w->'cp-ofs-demo-user-orders-v3') value
    where upper(btrim(value->>'externalReference'))=upper(btrim(p_ref));
  code:=item->'workerAssignments'->0->>'employeeCode';
  if exists(select 1 from public.cp_mobile_order_take t
      where upper(btrim(t.order_ref))=upper(btrim(p_ref))
        and (t.chat_id is distinct from dest or t.employee_code is distinct from code))
    or exists(select 1 from public.cp_mobile_order_proof p
      where upper(btrim(p.order_ref))=upper(btrim(p_ref))
        and (p.chat_id is distinct from dest or p.employee_code is distinct from code)) then
    raise exception 'Grup atau karyawan berbeda dari laporan Telegram sebelumnya. Perlu rekonsiliasi admin.';
  end if;
end;
$$;
revoke all on function public.cp_fh3_require_manual(text) from public,anon,authenticated,service_role;
