-- Single active account session, independent of the paid Supabase session limit.
-- No encryption key or chat content is stored in this table.
create table private.cp_account_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  session_created_at timestamptz not null,
  activated_at timestamptz not null default now()
);
alter table private.cp_account_sessions enable row level security;
revoke all on private.cp_account_sessions from public, anon, authenticated;

create function private.cp_session_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt()->>'session_id', '')::uuid
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
      and not exists (
        select 1 from private.cp_account_sessions active
        where active.user_id = s.user_id and active.session_id <> s.id
      )
  );
$$;

create function private.cp_session_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'active', private.cp_session_allowed(),
    'claimed', exists(select 1 from private.cp_account_sessions a
      where a.user_id = auth.uid() and a.session_id = nullif(auth.jwt()->>'session_id','')::uuid)
  );
$$;

create function private.cp_claim_session() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_id uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  session_time timestamptz;
  previous private.cp_account_sessions%rowtype;
begin
  if caller is null or current_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if exists(select 1 from auth.mfa_factors f where f.user_id=caller and f.status='verified')
     and coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'Complete two-step verification to continue.' using errcode = '42501';
  end if;
  select s.created_at into session_time from auth.sessions s
    where s.id=current_id and s.user_id=caller and (s.not_after is null or s.not_after > now());
  if session_time is null then
    raise exception 'Invalid authentication session.' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text, 9741));
  select * into previous from private.cp_account_sessions where user_id=caller;
  if found and previous.session_id <> current_id
     and (previous.session_created_at, previous.session_id) >= (session_time, current_id) then
    return jsonb_build_object('active', false, 'claimed', false);
  end if;
  insert into private.cp_account_sessions(user_id,session_id,session_created_at)
    values(caller,current_id,session_time)
    on conflict(user_id) do update set session_id=excluded.session_id,
      session_created_at=excluded.session_created_at, activated_at=now();
  return jsonb_build_object('active',true,'claimed',true);
end;
$$;

create function public.cp_account_session_state() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.cp_session_state(); $$;
create function public.cp_claim_account_session() returns jsonb
language sql security invoker set search_path = '' as $$ select private.cp_claim_session(); $$;

revoke all on function private.cp_session_allowed(), private.cp_session_state(), private.cp_claim_session() from public, anon;
revoke all on function public.cp_account_session_state(), public.cp_claim_account_session() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.cp_session_allowed(), private.cp_session_state(), private.cp_claim_session() to authenticated;
grant execute on function public.cp_account_session_state(), public.cp_claim_account_session() to authenticated;

-- Protect direct RPC/Data API requests as well as server API routes. These two
-- RPCs intentionally remain callable by a valid superseded session so it can
-- learn it was revoked; the claim function rejects any older-session takeover.
create function private.cp_check_request_session() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.role()='authenticated' then
    if coalesce(current_setting('request.path',true),'') not in ('/rpc/cp_account_session_state','/rpc/cp_claim_account_session') then
      if not private.cp_session_allowed() then
        raise sqlstate 'PT401' using message='This authentication session was replaced by a newer login.';
      end if;
    end if;
  end if;
end;
$$;
revoke all on function private.cp_check_request_session() from public;
grant usage on schema private to anon, service_role;
grant execute on function private.cp_check_request_session() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'private.cp_check_request_session';

-- Restrictive policies also cover Realtime and private Storage reads/writes.
-- This adds a condition to existing ownership policies; it grants no new access.
do $$
declare target record;
begin
  for target in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity
      and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('create policy cp_current_account_session on %I.%I as restrictive for all to authenticated using ((select private.cp_session_allowed())) with check ((select private.cp_session_allowed()))',target.nspname,target.relname);
  end loop;
end;
$$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
