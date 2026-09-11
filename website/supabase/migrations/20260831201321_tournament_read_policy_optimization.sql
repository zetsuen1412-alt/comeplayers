begin;

drop policy if exists tournaments_public_read on public.tournaments;
drop policy if exists tournaments_host_read on public.tournaments;

create policy tournaments_public_or_host_read
on public.tournaments
for select
to anon, authenticated
using (
  status in ('published', 'registration_closed', 'live', 'completed')
  or ((select auth.uid()) is not null and (select auth.uid()) = host_id)
);

commit;
