-- CP Boost Monitor FH3: website -> Android -> website; independent of Telegram tables.
-- Audit records + assignment use the same locked Payroll workspace transaction.
create table public.cp_mobile_assignment_audit (
  id bigint generated always as identity primary key,
  order_ref text not null,
  employee_code text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.cp_mobile_assignment_audit enable row level security;
revoke all on public.cp_mobile_assignment_audit from public, anon, authenticated;
grant select, insert on public.cp_mobile_assignment_audit to service_role;
grant usage, select on sequence public.cp_mobile_assignment_audit_id_seq to service_role;

create function public.cp_mobile_assign_fh3(p_order_ref text, p_employee_code text, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w jsonb;
  item jsonb;
  employee jsonb;
  updated_orders jsonb;
  ref text;
  existing_worker text;
begin
  if p_actor_id is null or nullif(btrim(p_order_ref), '') is null
    or nullif(btrim(p_employee_code), '') is null then
    raise exception 'Order, karyawan, dan admin wajib diisi.';
  end if;
  -- Atomic compare-and-set. All website edits/assignments update this same row.
  select payload into w from public.cp_payroll_workspace where id = 1 for update;
  if w is null then raise exception 'Payroll workspace tidak tersedia.'; end if;

  select value into item from jsonb_array_elements(
    coalesce(w->'cp-ofs-demo-user-orders-v3', '[]'::jsonb))
    where lower(value->>'externalReference') = lower(btrim(p_order_ref));
  if item is null then raise exception 'Order tidak ditemukan.'; end if;
  ref := item->>'externalReference';

  select value into employee from jsonb_array_elements(
    coalesce(w->'cp-ofs-demo-employees-v2', '[]'::jsonb))
    where upper(value->>'code') = upper(btrim(p_employee_code))
      and value->>'team'='FH3'
      and coalesce(value->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL')
      and nullif(value->>'sheetRosterMissingAt','') is null;
  if employee is null then raise exception 'Karyawan FH3 tidak aktif.'; end if;

  -- Safe client retry: identical previously committed mobile assignment is a no-op.
  if item->>'operationalStatus'='assigned'
    and item->'workerAssignments'->0->>'employeeCode'=employee->>'code'
    and item->'workerAssignments'->0->>'id' like 'mobile:%'
    and jsonb_array_length(coalesce(item->'workerAssignments','[]'::jsonb))=1 then
    return jsonb_build_object('ok',true,'alreadyAssigned',true,'orderRef',ref,
      'employeeCode',employee->>'code','employeeName',employee->>'name');
  end if;

  if item->>'team'<>'FH3' or item->>'orderType' not in ('boosting','item')
    or item->>'operationalStatus' not in ('draft','confirmed','assignment_pending')
    or coalesce((item->>'importNeedsReview')::boolean,false)
    or item->>'scheduleMode'='daily'
    or coalesce(jsonb_array_length(item->'workerAssignments'),0)<>0
    or nullif(item->>'employeeCode','') is not null
    or nullif(item->>'employeeName','') is not null
    or nullif(item->>'sheetDeletedAt','') is not null
    or nullif(item->>'websiteDeletedAt','') is not null
    or nullif(item->>'verifiedAt','') is not null
    or nullif(item->>'payrollClosedAt','') is not null
    or nullif(item->>'payrollPeriodId','') is not null
    or item->>'financeStatus'='closed'
    or exists (
      select 1 from jsonb_array_elements(coalesce(w->'cp-ofs-demo-closing-v1','[]'::jsonb)) c,
        jsonb_array_elements_text(coalesce(c->'orderRefs','[]'::jsonb)) r
      where lower(r)=lower(ref)
    ) then
    raise exception 'Order tidak tersedia untuk penugasan. Muat ulang data.';
  end if;
  -- Use existing Payroll assignment shape: no Telegram identity or session.
  select jsonb_agg(
    case when j->>'externalReference'=ref then j || jsonb_build_object(
      'employeeCode',employee->>'code',
      'employeeName',employee->>'name',
      'assignmentMode','direct',
      'workerAssignments',jsonb_build_array(jsonb_build_object(
        'id','mobile:'||ref||':'||(employee->>'code'),
        'employeeCode',employee->>'code',
        'employeeName',employee->>'name',
        'team','FH3',
        'process',coalesce(nullif(j->>'process',''),nullif(j->>'service',''),'JOKI'),
        'quantity',coalesce((j->>'quantity')::numeric,1)
      )),
      'operationalStatus','assigned'
    ) else j end order by n
  ) into updated_orders from jsonb_array_elements(w->'cp-ofs-demo-user-orders-v3')
    with ordinality as x(j,n);
  update public.cp_payroll_workspace
    set payload=jsonb_set(w,'{cp-ofs-demo-user-orders-v3}',updated_orders),
        revision=revision+1,updated_at=clock_timestamp()
    where id=1;
  insert into public.cp_mobile_assignment_audit(order_ref,employee_code,actor_id)
    values(ref,employee->>'code',p_actor_id);
  return jsonb_build_object('ok',true,'alreadyAssigned',false,'orderRef',ref,
    'employeeCode',employee->>'code','employeeName',employee->>'name');
end;
$$;
revoke all on function public.cp_mobile_assign_fh3(text,text,uuid) from public, anon, authenticated;
grant execute on function public.cp_mobile_assign_fh3(text,text,uuid) to service_role;
