-- Isolated CI database only. Never run this fixture against production.
create role anon;
create role authenticated;
create role service_role;
create table public.profiles(id uuid primary key, role text);
create table public.cp_payroll_workspace(id integer primary key,payload jsonb,revision bigint,updated_at timestamptz);
create table public.cp_payroll_workspace_audit(revision bigint,before_data jsonb,after_data jsonb);
create table public.cp_payroll_import_batches(id text primary key,status text check(status in ('staged','applied')),payload jsonb);
create function public.cp_save_payroll_workspace(p_revision bigint,p_payload jsonb,p_actor uuid,p_action text) returns jsonb language plpgsql as $$
declare w public.cp_payroll_workspace;
begin
 select * into w from public.cp_payroll_workspace where id=1 for update;
 if w.revision<>p_revision then raise exception 'Conflict' using errcode='40001'; end if;
 insert into public.cp_payroll_workspace_audit values(w.revision+1,w.payload,p_payload);
 update public.cp_payroll_workspace set payload=p_payload,revision=revision+1,updated_at=now() where id=1 returning * into w;
 return jsonb_build_object('state',w.payload,'revision',w.revision,'updatedAt',w.updated_at);
end;$$;
\ir ../supabase/migrations/20260917151000_payroll_mutation_reset.sql
insert into public.profiles values('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','admin'),('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','user');
insert into public.cp_payroll_workspace values(1,'{"cp-ofs-demo-user-orders-v3":[{"id":"one","externalReference":"X1","grossMinor":5000,"financeStatus":"pending","matchedPaymentMinor":0}],"cp-ofs-demo-employees-v2":[{"id":"employee"}],"cp-ofs-demo-product-games-v1":[{"id":"game"}],"cp-ofs-demo-kasbon-v2":[{"id":"loan"}],"cp-ofs-demo-mutation-history-v1":[{"id":"history"}]}',5,now());
insert into public.cp_payroll_import_batches values('test-import','applied','{"sourceRows":["kept"]}');
create function pg_temp.must_reject(actor uuid, rev bigint, n integer, phrase text, expected_code text) returns void language plpgsql as $$
begin
 begin
  perform public.cp_reset_payroll_mutations(rev,n,'cccccccc-cccc-4ccc-cccc-cccccccccccc',actor,phrase);
 exception when others then
  if sqlstate=expected_code then return; end if;
  raise;
 end;
 raise exception 'Expected refusal %, operation succeeded',expected_code;
end;$$;
select pg_temp.must_reject('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',5,1,'HAPUS SEMUA MUTASI','42501');
select pg_temp.must_reject('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',5,1,'yes','22023');
select pg_temp.must_reject('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',4,1,'HAPUS SEMUA MUTASI','40001');
select pg_temp.must_reject('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',5,2,'HAPUS SEMUA MUTASI','40001');
do $$
declare original jsonb; patched jsonb;
begin
 select payload into original from public.cp_payroll_workspace where id=1;
 for patched in select value from jsonb_array_elements('[{"cp-ofs-demo-period-lock-v1":{}},{"cp-ofs-demo-closing-v1":[{"orderRefs":[" x1 "]}]},{"cp-ofs-demo-closing-v1":[{"ordersSnapshot":[{"id":"one"}]}]},{"cp-ofs-demo-inventory-movements-v1":[{"orderReference":"x1"}]}]') loop
  update public.cp_payroll_workspace set payload=original||patched where id=1;
  perform pg_temp.must_reject('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',5,1,'HAPUS SEMUA MUTASI','55000');
 end loop;
 for patched in select value from jsonb_array_elements('[{"payrollClosedAt":"2026-09-01"},{"payrollPeriodId":"period"},{"financeStatus":"closed"},{"inventoryConsumedAt":"2026-09-01"},{"inventoryAllocations":[{"id":"stock"}]},{"matchedPaymentMinor":1},{"financeStatus":"reconciled"},{"financeStatus":"ready_to_close"}]') loop
  update public.cp_payroll_workspace set payload=jsonb_set(original,'{cp-ofs-demo-user-orders-v3,0}',original#>'{cp-ofs-demo-user-orders-v3,0}'||patched) where id=1;
  perform pg_temp.must_reject('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',5,1,'HAPUS SEMUA MUTASI','55000');
 end loop;
 update public.cp_payroll_workspace set payload=original where id=1;
 if exists(select 1 from public.cp_payroll_mutation_resets) or exists(select 1 from public.cp_payroll_workspace_audit) then raise exception 'Blocked reset wrote data'; end if;
end;$$;
-- Force backup insertion to fail, proving the data deletion and audit also roll back.
alter table public.cp_payroll_mutation_resets add constraint test_backup_failure check(removed_count<0);
select pg_temp.must_reject('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',5,1,'HAPUS SEMUA MUTASI','23514');
alter table public.cp_payroll_mutation_resets drop constraint test_backup_failure;
do $$
declare before jsonb; result jsonb;
begin
 select payload into before from public.cp_payroll_workspace where id=1;
 if (select revision from public.cp_payroll_workspace where id=1)<>5 or exists(select 1 from public.cp_payroll_workspace_audit) then raise exception 'Failed backup left partial changes'; end if;
 result:=public.cp_reset_payroll_mutations(5,1,'cccccccc-cccc-4ccc-cccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','HAPUS SEMUA MUTASI');
 if result->>'status'<>'cleared' or (result->>'revision')::bigint<>6 or jsonb_array_length(result#>'{state,cp-ofs-demo-user-orders-v3}')<>0 then raise exception 'Wrong reset result'; end if;
 if (result->'state')-'cp-ofs-demo-user-orders-v3'<>before-'cp-ofs-demo-user-orders-v3' then raise exception 'Unrelated data changed'; end if;
 if (select before_data from public.cp_payroll_mutation_resets limit 1)<>before then raise exception 'Wrong backup'; end if;
 if (select status from public.cp_payroll_import_batches where id='test-import')<>'cleared' or (select payload from public.cp_payroll_import_batches where id='test-import')<>'{"sourceRows":["kept"]}' then raise exception 'Import archive lost'; end if;
 if (select count(*) from public.cp_payroll_workspace_audit)<>1 then raise exception 'Missing audit'; end if;
 -- Simulate a new order created AFTER the reset and retry the original request.
 update public.cp_payroll_workspace set payload=jsonb_set(payload,'{cp-ofs-demo-user-orders-v3}', '[{"id":"new","externalReference":"X2","grossMinor":100}]'),revision=7 where id=1;
 result:=public.cp_reset_payroll_mutations(5,1,'cccccccc-cccc-4ccc-cccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','HAPUS SEMUA MUTASI');
 if result->>'status'<>'already_cleared' or jsonb_array_length(result#>'{state,cp-ofs-demo-user-orders-v3}')<>1 or (result->>'revision')::bigint<>7 then raise exception 'Retry deleted newer orders'; end if;
 if (select count(*) from public.cp_payroll_mutation_resets)<>1 then raise exception 'Duplicate receipt'; end if;
 if has_function_privilege('anon','public.cp_reset_payroll_mutations(bigint,integer,uuid,uuid,text)','execute') or has_function_privilege('authenticated','public.cp_reset_payroll_mutations(bigint,integer,uuid,uuid,text)','execute') or has_table_privilege('authenticated','public.cp_payroll_mutation_resets','select') then raise exception 'Unsafe public privileges'; end if;
 raise notice 'PASS: admin, confirmation, revision, count, locks, finance/stock dependencies, backup rollback, audit, idempotency, archive retention and privilege checks';
end;$$;
