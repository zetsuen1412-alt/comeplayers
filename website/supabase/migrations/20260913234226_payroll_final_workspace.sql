-- Final EvoCP payroll workspace. Only the authenticated admin server can access it.
create table public.cp_payroll_workspace (
  id smallint primary key check (id = 1),
  revision bigint not null default 0,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
create table public.cp_payroll_workspace_audit (
  revision bigint primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('save','close')),
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.cp_payroll_workspace enable row level security;
alter table public.cp_payroll_workspace_audit enable row level security;
revoke all on public.cp_payroll_workspace, public.cp_payroll_workspace_audit from public, anon, authenticated;
grant select, insert, update on public.cp_payroll_workspace to service_role;
grant select, insert on public.cp_payroll_workspace_audit to service_role;
insert into public.cp_payroll_workspace(id) values (1);

create function public.cp_save_payroll_workspace(p_revision bigint, p_payload jsonb, p_actor uuid, p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_row public.cp_payroll_workspace; next_row public.cp_payroll_workspace;
begin
  if not exists(select 1 from public.profiles where id=p_actor and lower(trim(role))='admin') then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_action not in ('save','close') or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>3500000 then
    raise exception 'Invalid payroll payload' using errcode='22023';
  end if;
  select * into current_row from public.cp_payroll_workspace where id=1 for update;
  if current_row.revision <> p_revision then
    raise exception 'PAYROLL_REVISION_CONFLICT' using errcode='40001';
  end if;
  update public.cp_payroll_workspace set payload=p_payload, revision=revision+1, updated_at=clock_timestamp() where id=1 returning * into next_row;
  insert into public.cp_payroll_workspace_audit(revision,actor_id,action,before_data,after_data)
    values(next_row.revision,p_actor,p_action,current_row.payload,p_payload);
  return jsonb_build_object('state',next_row.payload,'revision',next_row.revision,'updatedAt',next_row.updated_at);
end;
$$;
revoke all on function public.cp_save_payroll_workspace(bigint,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.cp_save_payroll_workspace(bigint,jsonb,uuid,text) to service_role;
