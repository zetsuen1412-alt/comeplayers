-- Add scoped payroll access without granting a marketplace administrator role.
create table public.cp_payroll_access (
  user_id uuid primary key references public.profiles(id),
  active boolean not null default true,
  granted_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cp_payroll_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  target_id uuid not null references public.profiles(id),
  target_name text not null,
  before_active boolean,
  after_active boolean not null,
  created_at timestamptz not null default now()
);
create index cp_payroll_access_granted_by_idx on public.cp_payroll_access(granted_by);
create index cp_payroll_access_updated_by_idx on public.cp_payroll_access(updated_by);
create index cp_payroll_access_audit_actor_idx on public.cp_payroll_access_audit(actor_id);
create index cp_payroll_access_audit_target_idx on public.cp_payroll_access_audit(target_id, id desc);
alter table public.cp_payroll_access enable row level security;
alter table public.cp_payroll_access_audit enable row level security;
revoke all on public.cp_payroll_access, public.cp_payroll_access_audit from public, anon, authenticated;
grant select, insert, update on public.cp_payroll_access to service_role;
grant select, insert on public.cp_payroll_access_audit to service_role;
revoke all on sequence public.cp_payroll_access_audit_id_seq from public, anon, authenticated;
grant usage, select on sequence public.cp_payroll_access_audit_id_seq to service_role;

alter table public.cp_payroll_workspace_audit add column actor_name text;
alter table public.cp_payroll_workspace_audit add column actor_email text;
alter table public.cp_payroll_workspace_audit add column changed_keys text[];
create index if not exists cp_payroll_workspace_audit_actor_idx on public.cp_payroll_workspace_audit(actor_id);

create function public.cp_set_payroll_access(p_actor uuid, p_target uuid, p_active boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actor public.profiles; target public.profiles; previous_active boolean; saved public.cp_payroll_access;
begin
  select * into actor from public.profiles where id=p_actor for share;
  if actor.id is null or not coalesce(lower(trim(actor.role)) = 'admin',false) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_active is null then raise exception 'Invalid payroll permission' using errcode='22023'; end if;
  -- Permission changes and saves for this member are serialized.
  perform pg_advisory_xact_lock(hashtextextended('cp_payroll_access:' || p_target::text,0));
  select * into target from public.profiles where id=p_target for share;
  if target.id is null then raise exception 'Profile not found' using errcode='22023'; end if;
  if lower(trim(target.role))='admin' then raise exception 'Administrator access is inherited' using errcode='22023'; end if;
  select active into previous_active from public.cp_payroll_access where user_id=p_target;
  if previous_active is not distinct from p_active or (previous_active is null and not p_active) then
    return jsonb_build_object('userId',p_target,'active',coalesce(previous_active,false),'changed',false);
  end if;
  insert into public.cp_payroll_access(user_id,active,granted_by,updated_by)
    values(p_target,p_active,p_actor,p_actor)
    on conflict(user_id) do update set active=excluded.active,updated_by=p_actor,updated_at=clock_timestamp()
    returning * into saved;
  insert into public.cp_payroll_access_audit(actor_id,actor_name,target_id,target_name,before_active,after_active)
    values(p_actor,coalesce(nullif(actor.username,''),nullif(actor.full_name,''),actor.email,p_actor::text),
      p_target,coalesce(nullif(target.username,''),nullif(target.full_name,''),target.email,p_target::text),
      previous_active,p_active);
  return jsonb_build_object('userId',p_target,'active',saved.active,'changed',true);
end;
$$;
revoke all on function public.cp_set_payroll_access(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.cp_set_payroll_access(uuid,uuid,boolean) to service_role;

create or replace function public.cp_save_payroll_workspace(p_revision bigint, p_payload jsonb, p_actor uuid, p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_row public.cp_payroll_workspace; next_row public.cp_payroll_workspace; actor public.profiles; changed text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('cp_payroll_access:' || p_actor::text,0));
  select * into actor from public.profiles where id=p_actor for share;
  if actor.id is null or not (coalesce(lower(trim(actor.role))='admin',false)
    or exists(select 1 from public.cp_payroll_access where user_id=p_actor and active)) then
    raise exception 'Payroll access required' using errcode='42501';
  end if;
  if p_revision is null or p_revision<0 or p_action is null or p_action not in ('save','close')
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>3500000 then
    raise exception 'Invalid payroll payload' using errcode='22023';
  end if;
  select * into current_row from public.cp_payroll_workspace where id=1 for update;
  if current_row.id is null then raise exception 'Payroll workspace unavailable'; end if;
  if current_row.revision<>p_revision then raise exception 'PAYROLL_REVISION_CONFLICT' using errcode='40001'; end if;
  if current_row.payload=p_payload then
    return jsonb_build_object('state',current_row.payload,'revision',current_row.revision,'updatedAt',current_row.updated_at);
  end if;
  select coalesce(array_agg(k order by k),'{}'::text[]) into changed from (
    select k from (select jsonb_object_keys(current_row.payload) as k union select jsonb_object_keys(p_payload) as k) keys
    where current_row.payload->k is distinct from p_payload->k
  ) changes;
  update public.cp_payroll_workspace set payload=p_payload,revision=revision+1,updated_at=clock_timestamp()
    where id=1 returning * into next_row;
  insert into public.cp_payroll_workspace_audit(revision,actor_id,actor_name,actor_email,action,changed_keys,before_data,after_data)
    values(next_row.revision,p_actor,coalesce(nullif(actor.username,''),nullif(actor.full_name,''),actor.email,p_actor::text),
      actor.email,p_action,changed,current_row.payload,p_payload);
  return jsonb_build_object('state',next_row.payload,'revision',next_row.revision,'updatedAt',next_row.updated_at);
end;
$$;
revoke all on function public.cp_save_payroll_workspace(bigint,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.cp_save_payroll_workspace(bigint,jsonb,uuid,text) to service_role;
