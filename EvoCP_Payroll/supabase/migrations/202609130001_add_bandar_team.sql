-- v0.14.8: add BANDAR as an employee section/team beside FH1/FH2/FH3/ADMIN.
insert into public.teams(organization_id, team_code, name, status)
select o.id, 'BANDAR', 'BANDAR', 'active'
from public.organizations o
where not exists (
  select 1 from public.teams t
  where t.organization_id = o.id and t.team_code = 'BANDAR'
);
