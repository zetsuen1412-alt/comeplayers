-- CP-OFS v0.14.1
-- Add ADMIN as the fourth employee section/team beside FH1, FH2, and FH3.

insert into public.teams (organization_id, team_code, name, status)
select o.id, 'ADMIN', 'ADMIN', 'active'
from public.organizations o
where not exists (
  select 1
  from public.teams t
  where t.organization_id = o.id
    and t.team_code = 'ADMIN'
);
