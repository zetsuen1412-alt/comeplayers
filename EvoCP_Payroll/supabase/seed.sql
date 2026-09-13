-- Demo seed values. Safe to replace in local development.
insert into public.organizations(id,name,slug,default_currency,timezone,status)
values ('00000000-0000-4000-8000-000000000001','ComePlayers','comeplayers','IDR','Asia/Jakarta','active')
on conflict (id) do nothing;

insert into public.permissions(code,description,category) values
('security.members.view','View organization members','security'),
('employees.view','View employees','employees'),
('employees.manage','Create and maintain employees','employees'),
('catalog.view','View Product/Game catalog','catalog'),
('catalog.manage','Create and maintain Product/Game catalog','catalog'),
('orders.view','View orders','orders'),
('orders.create','Create orders','orders'),
('orders.assign','Assign workers','orders'),
('orders.verify','Verify work','orders'),
('finance.view','View finance','finance'),
('finance.reconcile','Reconcile payments','finance'),
('payroll.view_all','View all payroll','payroll'),
('payroll.calculate','Calculate payroll','payroll'),
('payroll.approve','Approve payroll','payroll'),
('closing.view','View closing','closing'),
('closing.prepare','Prepare closing','closing'),
('closing.close','Close period','closing'),
('approvals.view','View approvals','approvals'),
('audit.view','View audit','audit'),
('vendors.view','View vendors','vendors'),
('inventory.quantity.view','View inventory quantity','inventory'),
('inventory.cost.view','View inventory cost','inventory'),
('workforce.view','View workforce','workforce')
on conflict (code) do nothing;

insert into public.roles(id,organization_id,code,name,is_system_role) values
('10000000-0000-4000-8000-000000000001',null,'owner','Owner',true),
('10000000-0000-4000-8000-000000000002',null,'finance_admin','Finance Admin',true),
('10000000-0000-4000-8000-000000000003',null,'finance_staff','Finance Staff',true),
('10000000-0000-4000-8000-000000000004',null,'supervisor','Supervisor',true),
('10000000-0000-4000-8000-000000000005',null,'operator','Operator',true),
('10000000-0000-4000-8000-000000000006',null,'worker','Worker',true),
('10000000-0000-4000-8000-000000000007',null,'auditor','Auditor',true)
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select '10000000-0000-4000-8000-000000000001', id from public.permissions
on conflict do nothing;

insert into public.teams(id,organization_id,team_code,name) values
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','FH1','FH1'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','FH2','FH2'),
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','FH3','FH3'),
('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','ADMIN','ADMIN'),
('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','BANDAR','BANDAR')
on conflict do nothing;

-- v0.13.0: employee and operational transaction data intentionally start empty.
-- Add employees from the Karyawan menu after deployment.

-- Product/Game catalog examples for v0.11.0. Region and Server are controlled values.
insert into public.games(id,organization_id,code,name,status,search_aliases) values
('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','GW2','Guild Wars 2','active',array['Guild Wars']),
('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','WUWA','Wuthering Waves','active',array['Wuwa']),
('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','BDO','Black Desert Online','active',array['Black Desert']),
('40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','WOW','World of Warcraft','active',array['WoW'])
on conflict do nothing;

insert into public.game_regions(id,organization_id,game_id,code,name) values
('41000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','NA','NA'),
('41000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','EU','EU'),
('41000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','SEA','SEA'),
('41000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','ASIA','Asia'),
('41000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','SEA','SEA'),
('41000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','US','US'),
('41000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','EU','EU')
on conflict do nothing;

insert into public.game_servers(id,organization_id,game_id,region_id,code,name) values
('42000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','NA','NA'),
('42000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','EU','EU'),
('42000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000003','SEA','SEA'),
('42000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000004','ASIA','Asia'),
('42000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000005','SEA','SEA'),
('42000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000006','US','US'),
('42000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000007','EU','EU')
on conflict do nothing;
