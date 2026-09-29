-- Keep existing per-account SELECT policies and privileges unchanged.
-- Publish notifications so the account alert listener receives inserts immediately.
do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notifications' and c.relrowsecurity) then
    raise exception 'notifications must have row level security before realtime is enabled';
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
