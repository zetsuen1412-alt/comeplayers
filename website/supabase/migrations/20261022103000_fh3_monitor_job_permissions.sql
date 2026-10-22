-- Supabase default privileges can grant service_role ALL on newly created tables.
-- Retain journal history even when those defaults are present.
revoke all on public.cp_fh3_monitor_jobs from public,anon,authenticated,service_role;
grant select,insert,update on public.cp_fh3_monitor_jobs to service_role;
