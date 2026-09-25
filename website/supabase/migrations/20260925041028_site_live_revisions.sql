-- Realtime invalidations contain no business rows or confidential payloads.
create schema if not exists cp_live_private;
revoke all on schema cp_live_private from public, anon, authenticated;
grant usage on schema cp_live_private to authenticated;

create table public.cp_live_revisions (
  scope text primary key check (scope in ('catalog', 'admin', 'payroll') or scope ~ '^user:[0-9a-f-]{36}$'),
  revision bigint not null default 1 check (revision > 0),
  changed_at timestamptz not null default clock_timestamp()
);
alter table public.cp_live_revisions enable row level security;
revoke all on public.cp_live_revisions from public, anon, authenticated;
grant select on public.cp_live_revisions to anon, authenticated;
grant all on public.cp_live_revisions to service_role;

-- This internal lookup deliberately bypasses RLS on the service-only payroll
-- access table. It checks the caller, never a caller-supplied user ID or JWT metadata.
create function cp_live_private.can_read(p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(trim(coalesce(p.role,''))) = 'admin')
    or (p_scope = 'payroll' and exists (
      select 1 from public.cp_payroll_access a where a.user_id = auth.uid() and a.active
    ))
  );
$$;
revoke all on function cp_live_private.can_read(text) from public, anon, authenticated;
grant execute on function cp_live_private.can_read(text) to authenticated;

create policy live_catalog_read on public.cp_live_revisions for select to anon, authenticated
  using (scope = 'catalog');
create policy live_own_read on public.cp_live_revisions for select to authenticated
  using (scope = 'user:' || (select auth.uid())::text);
create policy live_workspace_read on public.cp_live_revisions for select to authenticated
  using (scope in ('admin','payroll') and cp_live_private.can_read(scope));

insert into public.cp_live_revisions(scope) values ('catalog'), ('admin'), ('payroll');

-- Called only by row triggers after the original operation's authorization.
-- Definer rights permit writing this internal table without granting clients
-- any write access. This trigger function is not exposed as a callable RPC.
create function cp_live_private.notify_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb := '{}'::jsonb;
  after_row jsonb := '{}'::jsonb;
  row_data jsonb;
  scopes text[] := string_to_array(tg_argv[0], ',');
  target text;
  owner_id text;
  owner_key text;
  parent_id text;
begin
  -- Payroll payloads/import chunks can be large; their shared scope does not
  -- require serializing those rows. Access changes additionally notify the user.
  if tg_argv[0] <> 'payroll' or tg_table_name = 'cp_payroll_access' then
  before_row := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_row := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  -- Heartbeats/timestamps and no-op updates do not cause site-wide reload storms.
  if tg_op = 'UPDATE' and
    (before_row - array['updated_at','last_seen_at','last_active_at','last_online_at','seller_last_seen_at']) =
    (after_row - array['updated_at','last_seen_at','last_active_at','last_online_at','seller_last_seen_at']) then
    return null;
  end if;
  end if;
  if tg_table_name = 'profiles' and (
    tg_op <> 'UPDATE' or
    (select jsonb_object_agg(key,value) from jsonb_each(before_row) where key in ('username','avatar_url','bio') or key like 'seller_%' or key like 'store_%') is distinct from
    (select jsonb_object_agg(key,value) from jsonb_each(after_row) where key in ('username','avatar_url','bio') or key like 'seller_%' or key like 'store_%')
  ) then scopes := array_append(scopes, 'catalog'); end if;

  -- Notify both previous and new owners on reassignment/deletion.
  foreach row_data in array array[before_row, after_row] loop
    foreach owner_key in array array['user_id','buyer_id','seller_id','follower_id','host_id','requester_id','addressee_id','user_a','user_b'] loop
      owner_id := row_data ->> owner_key;
      if owner_id ~ '^[0-9a-f-]{36}$' then scopes := array_append(scopes, 'user:' || owner_id); end if;
    end loop;
    if tg_table_name = 'profiles' then
      owner_id := row_data ->> 'id';
      if owner_id is not null then scopes := array_append(scopes, 'user:' || owner_id); end if;
    end if;
    -- Child rows written by support/admin must also invalidate the customer's view.
    parent_id := row_data ->> 'ticket_id';
    if parent_id is not null and tg_table_name = 'support_ticket_messages' then
      select t.user_id::text into owner_id from public.support_tickets t where t.id::text = parent_id;
      if owner_id is not null then scopes := array_append(scopes, 'user:' || owner_id); end if;
    end if;
    parent_id := row_data ->> 'dispute_id';
    if parent_id is not null and tg_table_name in ('dispute_messages','dispute_evidence','dispute_events') then
      for owner_id in select unnest(array[d.buyer_id::text,d.seller_id::text]) from public.disputes d where d.id::text = parent_id loop
        if owner_id is not null then scopes := array_append(scopes, 'user:' || owner_id); end if;
      end loop;
    end if;
    parent_id := row_data ->> 'order_id';
    if parent_id is not null and tg_table_name in ('order_delivery_vaults','order_pricing_snapshots','order_tax_snapshots') then
      for owner_id in select unnest(array[o.buyer_id::text,o.seller_id::text]) from public.orders o where o.id::text = parent_id loop
        if owner_id is not null then scopes := array_append(scopes, 'user:' || owner_id); end if;
      end loop;
    end if;
  end loop;

  for target in select distinct value from unnest(scopes) as s(value) where value <> '' order by value loop
    insert into public.cp_live_revisions(scope, revision, changed_at)
      values (target, 1, transaction_timestamp())
    on conflict (scope) do update
      set revision = cp_live_revisions.revision + 1, changed_at = excluded.changed_at
      where cp_live_revisions.changed_at is distinct from excluded.changed_at;
  end loop;
  return null;
end;
$$;
revoke all on function cp_live_private.notify_change() from public, anon, authenticated;

-- Explicit allowlist: no blanket publication of financial, chat, or secret tables.
do $$
declare item record;
begin
  for item in
    select unnest(array[
      'categories','category_game_master','game_categories','game_marketplace_categories','game_master','game_platforms','game_trending_snapshots',
      'products','product_variants','flash_sales','announcements','reviews','seller_reviews','seller_store_featured_products',
      'seller_storefronts','tournaments','tournament_registrations','exchange_rates','fx_rates','seller_followers'
    ]) as table_name, 'catalog,admin' as scopes
    union all select unnest(array[
      'orders','wallets','wallet_transactions','wallet_topups','cp_wallet_topup_intents','withdrawal_requests','payout_accounts',
      'seller_applications','seller_daily_stats','seller_catalog_imports','seller_policy_strikes','notifications',
      'disputes','dispute_messages','dispute_evidence','dispute_events','support_tickets','support_ticket_messages',
      'order_invoices','order_delivery_vaults','order_pricing_snapshots','order_tax_snapshots',
      'seller_tax_residencies','seller_tax_statements','seller_tax_ledger','user_verifications','user_risk_profiles',
      'security_events','privacy_requests','privacy_events','profiles',
      'operational_alerts','operational_runs','reconciliation_issues','reconciliation_runs','provider_settlement_reports',
      'provider_settlement_lines','coupons','coupon_usages','admin_audit_logs','igdb_sync_runs','igdb_import_candidates',
      'chat_moderation_events','chat_reports','notification_events','notification_event_logs','platform_finance_settings',
      'marketplace_fee_settings','seller_tax_settings','seller_tax_statement_lines','runtime_controls','product_policy_reviews',
      'rate_change_requests','withdrawal_tax_rates','seller_sales_tax_rates','accounting_periods','launch_signoffs'
    ]), 'admin'
    union all select unnest(array[
      'announcement_reads','wishlists','user_account_settings','user_billing_profiles',
      'user_social_connections','user_security_controls','user_security_devices','chat_room_members','chat_friendships'
    ]), ''
    union all select unnest(array[
      'cp_payroll_workspace','cp_payroll_workspace_audit','cp_payroll_access','cp_payroll_access_audit',
      'cp_payroll_import_batches','cp_payroll_import_chunks','cp_payroll_mutation_resets',
      'cp_payroll_employees','cp_payroll_periods','cp_payroll_entries'
    ]), 'payroll'
  loop
    if to_regclass(format('public.%I', item.table_name)) is not null then
      execute format('create trigger cp_notify_live_change after insert or update or delete on public.%I for each row execute function cp_live_private.notify_change(%L)', item.table_name, item.scopes);
    end if;
  end loop;
end;
$$;

alter publication supabase_realtime add table public.cp_live_revisions;
