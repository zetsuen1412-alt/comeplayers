-- One SELECT policy per role avoids evaluating overlapping permissive policies.
drop policy live_catalog_read on public.cp_live_revisions;
drop policy live_own_read on public.cp_live_revisions;
drop policy live_workspace_read on public.cp_live_revisions;

create policy live_public_read on public.cp_live_revisions for select to anon
  using (scope = 'catalog');
create policy live_authorized_read on public.cp_live_revisions for select to authenticated
  using (
    scope = 'catalog'
    or scope = 'user:' || (select auth.uid())::text
    or (scope in ('admin','payroll') and cp_live_private.can_read(scope))
  );
