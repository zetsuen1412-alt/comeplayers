-- Contact discovery and blocks are accessed through authenticated application routes.
create table public.chat_user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index chat_user_blocks_target_idx on public.chat_user_blocks(blocked_id, blocker_id);
alter table public.chat_user_blocks enable row level security;
revoke all on public.chat_user_blocks from anon, authenticated;
grant select on public.chat_user_blocks to authenticated;
grant all on public.chat_user_blocks to service_role;
create policy "Read own blocks" on public.chat_user_blocks for select to authenticated
  using ((select auth.uid()) = blocker_id);

create or replace function public.cp_find_contact_phone(p_phone text)
returns table(user_id uuid) language sql stable security invoker set search_path = '' as $$
  select distinct v.user_id from public.user_verifications v
  where v.phone_verified = true and p_phone ~ '^[1-9][0-9]{7,14}$'
  and case
    when regexp_replace(v.phone_number, '[^0-9]', '', 'g') like '00%' then substring(regexp_replace(v.phone_number, '[^0-9]', '', 'g') from 3)
    when regexp_replace(v.phone_number, '[^0-9]', '', 'g') like '0%' then '62' || substring(regexp_replace(v.phone_number, '[^0-9]', '', 'g') from 2)
    else regexp_replace(v.phone_number, '[^0-9]', '', 'g') end = p_phone
  limit 2;
$$;
revoke all on function public.cp_find_contact_phone(text) from public, anon, authenticated;
grant execute on function public.cp_find_contact_phone(text) to service_role;

create or replace function public.cp_open_direct_contact(p_actor uuid, p_target uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_room public.chat_rooms; v_pair text;
begin
  if p_actor is null or p_target is null or p_actor = p_target then raise exception 'Invalid contact'; end if;
  if not exists(select 1 from public.profiles where id = p_target and anonymized_at is null) then raise exception 'Contact not found'; end if;
  v_pair := least(p_actor::text,p_target::text) || ':' || greatest(p_actor::text,p_target::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair, 0));
  if exists(select 1 from public.chat_user_blocks where (blocker_id=p_actor and blocked_id=p_target) or (blocker_id=p_target and blocked_id=p_actor)) then raise exception 'Contact blocked'; end if;
  select * into v_room from public.chat_rooms where room_type = 'direct' and product_id is null and order_id is null
    and ((buyer_id=p_actor and seller_id=p_target) or (buyer_id=p_target and seller_id=p_actor)) order by created_at asc limit 1;
  if v_room.id is null then
    insert into public.chat_rooms(buyer_id,seller_id,room_type,created_by,status)
    values(p_actor,p_target,'direct',p_actor,'active') returning * into v_room;
  end if;
  return to_jsonb(v_room);
end;
$$;
revoke all on function public.cp_open_direct_contact(uuid,uuid) from public, anon, authenticated;
grant execute on function public.cp_open_direct_contact(uuid,uuid) to service_role;

-- Only service_role can write messages/invites; the invoker trigger protects every write route.
create or replace function public.cp_guard_contact_block()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_a uuid; v_b uuid;
begin
  if tg_table_name = 'chat_messages' then
    select buyer_id, seller_id into v_a,v_b from public.chat_rooms where id=new.room_id and room_type <> 'group';
  elsif new.status = 'pending' then
    v_a := new.inviter_id; v_b := new.invitee_id;
  end if;
  if v_a is not null and v_b is not null then
    perform pg_advisory_xact_lock(hashtextextended(least(v_a::text,v_b::text)||':'||greatest(v_a::text,v_b::text), 0));
    if exists(select 1 from public.chat_user_blocks where (blocker_id=v_a and blocked_id=v_b) or (blocker_id=v_b and blocked_id=v_a)) then
      raise exception 'Messaging is unavailable: contact blocked' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.cp_guard_contact_block() from public, anon, authenticated;
create trigger cp_contact_block_messages before insert on public.chat_messages for each row execute function public.cp_guard_contact_block();
create trigger cp_contact_block_invitations before insert or update on public.chat_party_invitations for each row execute function public.cp_guard_contact_block();

create index chat_direct_contact_pair_idx on public.chat_rooms(buyer_id,seller_id,created_at)
  where room_type='direct' and product_id is null and order_id is null;
