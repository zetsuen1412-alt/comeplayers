-- A private call references an immutable E2EE history event containing its
-- random media key. The server can route/ring the call but cannot read the key.
alter table public.cp_calls add column if not exists encryption_envelope jsonb;
alter table public.cp_calls add column if not exists private_call boolean not null default false;
alter table public.cp_calls add column if not exists secure_event_id uuid references public.cp_secure_events(id) on delete set null;
create unique index if not exists cp_calls_secure_event_unique on public.cp_calls(secure_event_id) where secure_event_id is not null;

create function public.cp_start_secure_call(p_actor uuid,p_device uuid,p_target uuid,p_room uuid,p_media text,p_event uuid,p_scheduled timestamptz default null)
returns public.cp_calls language plpgsql security invoker set search_path='' as $$
declare encrypted public.cp_secure_events; result public.cp_calls; current_epoch public.cp_secure_epochs;
begin
  if p_actor is null or p_device is null or p_event is null then raise exception 'Invalid encrypted call'; end if;
  select * into encrypted from public.cp_secure_events where id=p_event and room_id=p_room and sender_id=p_actor and device_id=p_device and blob_id is null;
  if encrypted is null or encrypted.created_at<now()-interval '5 minutes' then raise exception 'Encrypted call key unavailable'; end if;
  if exists(select 1 from public.cp_calls where secure_event_id=p_event) then raise exception 'Encrypted call key already used'; end if;
  if not exists(select 1 from public.cp_secure_devices d where d.user_id=p_actor and d.device_id=p_device and d.revoked_revision is null) then raise exception 'Inactive device'; end if;
  select * into current_epoch from public.cp_secure_epochs where room_id=p_room order by epoch desc limit 1;
  if current_epoch is null or encrypted.epoch_id<>current_epoch.id then raise exception 'Rotate the conversation key before calling'; end if;
  if exists(select 1 from jsonb_array_elements(current_epoch.payload->'members') m
    where not exists(select 1 from public.cp_secure_accounts a where a.user_id=(m->'roster'->'identity'->>'userId')::uuid and a.roster=m->'roster')) then raise exception 'Rotate after device changes'; end if;
  result=public.cp_start_call(p_actor,p_target,p_room,p_media,p_scheduled);
  update public.cp_calls set private_call=true,secure_event_id=p_event,encryption_envelope=null where id=result.id returning * into result;
  return result;
end $$;
revoke all on function public.cp_start_secure_call(uuid,uuid,uuid,uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.cp_start_secure_call(uuid,uuid,uuid,uuid,text,uuid,timestamptz) to service_role;
