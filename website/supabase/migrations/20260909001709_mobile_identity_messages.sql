-- Phone enforcement is activated only after the configured OTP delivery flow is verified.
create schema if not exists cp_private;
revoke all on schema cp_private from public;
grant usage on schema cp_private to authenticated, service_role;

create table public.cp_platform_settings (
  id boolean primary key default true check(id),
  phone_required boolean not null default false
);
insert into public.cp_platform_settings(id,phone_required) values(true,false);
alter table public.cp_platform_settings enable row level security;
revoke all on public.cp_platform_settings from anon,authenticated;
grant all on public.cp_platform_settings to service_role;

alter table public.profiles add column username_changes integer not null default 0 check(username_changes >= 0);
create unique index cp_profiles_username_case_unique on public.profiles(lower(username)) where username is not null;
create function cp_private.guard_username_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then new.username_changes:=0; return new; end if;
  if new.username_changes is distinct from old.username_changes then raise exception 'Username allowance cannot be edited'; end if;
  if new.username is distinct from old.username then
    -- Only the database service may replace an identity for account deletion.
    if current_user in ('service_role','postgres') and new.privacy_status='anonymized' and new.anonymized_at is not null and new.username='deleted-'||left(new.id::text,12) then return new; end if;
    if new.username is null or new.username !~ '^[a-z0-9][a-z0-9_.-]{2,29}$' then raise exception 'Invalid username'; end if;
    if old.username is not null and old.username_changes >= 1 then raise exception 'The free username change has already been used'; end if;
    new.username_changes:=old.username_changes + case when old.username is null then 0 else 1 end;
  end if;
  return new;
end $$;
revoke all on function cp_private.guard_username_change() from public,anon,authenticated;
create trigger cp_username_allowance before insert or update on public.profiles for each row execute function cp_private.guard_username_change();
create function public.cp_change_username_once(p_user uuid,p_username text) returns text language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.profiles where id=p_user for update;
  if not found then raise exception 'Account not found'; end if;
  update public.profiles set username=p_username where id=p_user;
  return p_username;
end $$;
revoke all on function public.cp_change_username_once(uuid,text) from public,anon,authenticated;
grant execute on function public.cp_change_username_once(uuid,text) to service_role;

-- Self-service writes cannot assert phone/email/identity verification.
revoke insert,update,delete on public.user_verifications from anon,authenticated;
drop policy if exists verifications_insert_own on public.user_verifications;
drop policy if exists verifications_update_admin_only on public.user_verifications;
create function cp_private.sync_confirmed_phone() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.phone is distinct from old.phone or new.phone_confirmed_at is distinct from old.phone_confirmed_at then
    insert into public.user_verifications(user_id,phone_number,phone_verified,updated_at)
      values(new.id,case when nullif(new.phone,'') is not null then '+'||ltrim(new.phone,'+') else null end,
        new.phone_confirmed_at is not null and ltrim(new.phone,'+') ~ '^[1-9][0-9]{7,14}$',now())
      on conflict(user_id) do update set phone_number=excluded.phone_number,phone_verified=excluded.phone_verified,updated_at=excluded.updated_at;
  end if;
  return new;
end $$;
revoke all on function cp_private.sync_confirmed_phone() from public,anon,authenticated;
create trigger cp_auth_phone_identity after update of phone,phone_confirmed_at on auth.users for each row execute function cp_private.sync_confirmed_phone();
create trigger zz_cp_auth_phone_identity after insert on auth.users for each row execute function cp_private.sync_confirmed_phone();
insert into public.user_verifications(user_id,phone_number,phone_verified,updated_at)
  select id,case when nullif(phone,'') is not null then '+'||ltrim(phone,'+') else null end,phone_confirmed_at is not null and ltrim(phone,'+') ~ '^[1-9][0-9]{7,14}$',now() from auth.users
  on conflict(user_id) do update set phone_number=excluded.phone_number,phone_verified=excluded.phone_verified,updated_at=excluded.updated_at;

create table public.cp_messaging_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone_country text not null default 'ID' check(phone_country ~ '^[A-Z]{2}$'),
  read_receipts boolean not null default true,
  show_last_seen boolean not null default true,
  allow_calls boolean not null default true,
  message_notifications boolean not null default true,
  call_notifications boolean not null default true,
  status_audience text not null default 'contacts' check(status_audience in ('contacts','nobody'))
);
create table public.cp_chat_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  pinned boolean not null default false,
  archived boolean not null default false,
  muted boolean not null default false,
  list_name text not null default '' check(length(list_name)<=40),
  cleared_before timestamptz,
  primary key(user_id,room_id)
);
create index cp_chat_preferences_room_idx on public.cp_chat_preferences(room_id);
create table public.cp_starred_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,message_id)
);
create index cp_starred_messages_message_idx on public.cp_starred_messages(message_id);
create table public.cp_statuses (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check(length(body)<=700),
  storage_path text,
  mime_type text,
  background text not null default '#183e38' check(background ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  check(length(trim(body))>0 or storage_path is not null)
);
create index cp_statuses_author_expiry_idx on public.cp_statuses(author_id,expires_at desc);
create table public.cp_status_views (
  status_id uuid not null references public.cp_statuses(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key(status_id,viewer_id)
);
create index cp_status_views_viewer_idx on public.cp_status_views(viewer_id);
create table public.cp_calls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  media text not null default 'audio' check(media in ('audio','video')),
  status text not null default 'ringing' check(status in ('scheduled','ringing','accepted','declined','cancelled','missed','ended')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  check(caller_id<>callee_id)
);
create index cp_calls_caller_created_idx on public.cp_calls(caller_id,created_at desc);
create index cp_calls_callee_created_idx on public.cp_calls(callee_id,created_at desc);
create index cp_calls_room_idx on public.cp_calls(room_id);

do $$ declare tab text; begin
  foreach tab in array array['cp_messaging_settings','cp_chat_preferences','cp_starred_messages','cp_statuses','cp_status_views','cp_calls'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from anon,authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
  end loop;
end $$;

-- This no-argument helper can only answer for the authenticated caller.
create function cp_private.phone_access() returns boolean language sql stable security definer set search_path='' as $$
  select (not (select phone_required from public.cp_platform_settings where id=true)
    or exists(select 1 from auth.users where id=(select auth.uid()) and phone_confirmed_at is not null and ltrim(phone,'+') ~ '^[1-9][0-9]{7,14}$'))
    and ((select auth.jwt()->>'aal')='aal2' or not exists(select 1 from auth.mfa_factors where user_id=(select auth.uid()) and status='verified'));
$$;
revoke all on function cp_private.phone_access() from public,anon;
grant execute on function cp_private.phone_access() to authenticated,service_role;
do $$ declare tab text; begin
  for tab in select tablename from pg_tables where schemaname='public' and
    (tablename like 'chat_%' or tablename in ('orders','wallets','wallet_transactions','withdrawal_requests','disputes','payout_accounts')) loop
    execute format('create policy cp_verified_phone_access on public.%I as restrictive for all to authenticated using ((select cp_private.phone_access())) with check ((select cp_private.phone_access()))',tab);
  end loop;
end $$;

-- Service-backed entry points also enforce the actual actor when creating protected records.
create function cp_private.guard_phone_insert() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  if not (select phone_required from public.cp_platform_settings where id=true) then return new; end if;
  actor:=(to_jsonb(new)->>tg_argv[0])::uuid;
  if actor is not null and not exists(select 1 from auth.users where id=actor and phone_confirmed_at is not null and ltrim(phone,'+') ~ '^[1-9][0-9]{7,14}$') then
    raise exception 'Phone verification required' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function cp_private.guard_phone_insert() from public,anon,authenticated;
create trigger cp_phone_message_insert before insert on public.chat_messages for each row execute function cp_private.guard_phone_insert('sender_id');
create trigger cp_phone_order_insert before insert on public.orders for each row execute function cp_private.guard_phone_insert('buyer_id');
create trigger cp_phone_withdrawal_insert before insert on public.withdrawal_requests for each row execute function cp_private.guard_phone_insert('user_id');
create trigger cp_phone_status_insert before insert on public.cp_statuses for each row execute function cp_private.guard_phone_insert('author_id');
create trigger cp_phone_call_insert before insert on public.cp_calls for each row execute function cp_private.guard_phone_insert('caller_id');
create trigger cp_phone_callee_insert before insert on public.cp_calls for each row execute function cp_private.guard_phone_insert('callee_id');

create or replace function public.cp_find_contact_phone(p_phone text)
returns table(user_id uuid) language sql stable security definer set search_path='' as $$
  select id from auth.users where phone_confirmed_at is not null and p_phone ~ '^[1-9][0-9]{7,14}$' and ltrim(phone,'+')=p_phone limit 2;
$$;
revoke all on function public.cp_find_contact_phone(text) from public,anon,authenticated;
grant execute on function public.cp_find_contact_phone(text) to service_role;

create function cp_private.limit_status_posts() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('status:'||new.author_id::text,0));
  if (select count(*) from public.cp_statuses where author_id=new.author_id and created_at>now()-interval '24 hours')>=30 then raise exception 'Status limit reached' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function cp_private.limit_status_posts() from public,anon,authenticated;
create trigger cp_status_rate_limit before insert on public.cp_statuses for each row execute function cp_private.limit_status_posts();

create or replace function public.cp_set_contact_block(p_actor uuid,p_target uuid,p_block boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_actor is null or p_target is null or p_actor=p_target then raise exception 'Invalid contact'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(p_actor::text,p_target::text)||':'||greatest(p_actor::text,p_target::text),0));
  if p_block then
    insert into public.chat_user_blocks(blocker_id,blocked_id) values(p_actor,p_target) on conflict do nothing;
    update public.chat_party_invitations set status='declined',responded_at=now() where status='pending' and ((inviter_id=p_actor and invitee_id=p_target) or (inviter_id=p_target and invitee_id=p_actor));
    update public.cp_calls set status='ended',ended_at=now() where status in('scheduled','ringing','accepted') and ((caller_id=p_actor and callee_id=p_target) or (caller_id=p_target and callee_id=p_actor));
  else delete from public.chat_user_blocks where blocker_id=p_actor and blocked_id=p_target; end if;
end $$;
revoke all on function public.cp_set_contact_block(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.cp_set_contact_block(uuid,uuid,boolean) to service_role;

create function public.cp_start_call(p_actor uuid,p_target uuid,p_room uuid,p_media text,p_scheduled timestamptz default null)
returns public.cp_calls language plpgsql security invoker set search_path='' as $$
declare result public.cp_calls;
begin
  if p_actor is null or p_target is null or p_actor=p_target or p_media not in ('audio','video') then raise exception 'Invalid call'; end if;
  perform pg_advisory_xact_lock(hashtextextended('call:'||least(p_actor::text,p_target::text),0));
  perform pg_advisory_xact_lock(hashtextextended('call:'||greatest(p_actor::text,p_target::text),0));
  perform pg_advisory_xact_lock(hashtextextended(least(p_actor::text,p_target::text)||':'||greatest(p_actor::text,p_target::text),0));
  if not exists(select 1 from public.chat_rooms where id=p_room and room_type<>'group' and status='active' and ((buyer_id=p_actor and seller_id=p_target) or (buyer_id=p_target and seller_id=p_actor))) then raise exception 'Conversation is unavailable'; end if;
  if exists(select 1 from public.chat_user_blocks where (blocker_id=p_actor and blocked_id=p_target) or (blocker_id=p_target and blocked_id=p_actor)) then raise exception 'Contact blocked'; end if;
  if exists(select 1 from public.cp_messaging_settings where user_id=p_target and not allow_calls) then raise exception 'Contact is not accepting calls'; end if;
  if p_scheduled is not null and (p_scheduled<now()+interval '1 minute' or p_scheduled>now()+interval '30 days') then raise exception 'Invalid scheduled time'; end if;
  update public.cp_calls set status='missed',ended_at=now() where status='ringing' and created_at<now()-interval '60 seconds' and (caller_id in(p_actor,p_target) or callee_id in(p_actor,p_target));
  update public.cp_calls set status='ended',ended_at=now() where status='accepted' and answered_at<now()-interval '1 hour' and (caller_id in(p_actor,p_target) or callee_id in(p_actor,p_target));
  if p_scheduled is null and exists(select 1 from public.cp_calls where status in('ringing','accepted') and (caller_id in(p_actor,p_target) or callee_id in(p_actor,p_target))) then raise exception 'A participant is already in a call'; end if;
  if (select count(*) from public.cp_calls where caller_id=p_actor and created_at>now()-interval '1 minute')>=5 then raise exception 'Call limit reached'; end if;
  insert into public.cp_calls(room_id,caller_id,callee_id,media,status,scheduled_at) values(p_room,p_actor,p_target,p_media,case when p_scheduled is null then 'ringing' else 'scheduled' end,p_scheduled) returning * into result;
  return result;
end $$;
revoke all on function public.cp_start_call(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.cp_start_call(uuid,uuid,uuid,text,timestamptz) to service_role;
