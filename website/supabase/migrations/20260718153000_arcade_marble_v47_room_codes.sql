-- ComePlayers Marble V47: six-character invite codes for online rooms.
-- Safe to run more than once after 20260713234500_arcade_cp_monopoly_v43.sql.

begin;

create or replace function public.arcade_monopoly_generate_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (
      select 1
      from public.arcade_monopoly_rooms
      where room_code = v_code
        and status in ('waiting', 'active')
    );
  end loop;
  return v_code;
end;
$$;

alter table public.arcade_monopoly_rooms
  add column if not exists room_code text;

update public.arcade_monopoly_rooms
set room_code = upper(substr(replace(id::text, '-', ''), 1, 6))
where room_code is null or char_length(room_code) <> 6;

alter table public.arcade_monopoly_rooms
  alter column room_code set default public.arcade_monopoly_generate_room_code();

alter table public.arcade_monopoly_rooms
  alter column room_code set not null;

create unique index if not exists arcade_monopoly_room_code_v47_idx
  on public.arcade_monopoly_rooms (room_code);

alter table public.arcade_monopoly_rooms
  drop constraint if exists arcade_monopoly_room_code_format;

alter table public.arcade_monopoly_rooms
  add constraint arcade_monopoly_room_code_format
  check (room_code ~ '^[A-Z0-9]{6}$');

create or replace function public.arcade_monopoly_join_room_code(p_room_code text)
returns setof public.arcade_monopoly_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_room_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join an online ComePlayers Marble room.';
  end if;

  if char_length(v_code) <> 6 then
    raise exception 'Invite code must contain six characters.';
  end if;

  select id into v_room_id
  from public.arcade_monopoly_rooms
  where room_code = v_code
    and status = 'waiting'
    and updated_at > now() - interval '150 seconds'
  order by updated_at desc
  limit 1;

  if v_room_id is null then
    raise exception 'Invite code is invalid or the room is no longer available.';
  end if;

  return query
  select * from public.arcade_monopoly_join_room(v_room_id);
end;
$$;

grant execute on function public.arcade_monopoly_generate_room_code() to authenticated;
grant execute on function public.arcade_monopoly_join_room_code(text) to authenticated;

commit;
