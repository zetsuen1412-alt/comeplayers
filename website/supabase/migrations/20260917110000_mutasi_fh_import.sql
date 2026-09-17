-- A pinned, administrator-only import of the user-provided MUTASI FH workbook.
-- Source data stays in a private database archive, never in a public asset.
create table if not exists public.cp_payroll_import_batches (
 id text primary key, source_filename text not null, source_sheet text not null,
 source_sha256 text not null, payload_sha256 text not null,
 summary jsonb not null check (jsonb_typeof(summary)='object'),
 payload jsonb not null check (jsonb_typeof(payload)='object'),
 status text not null default 'staged' check (status in ('staged','applied')),
 created_at timestamptz not null default now(), applied_at timestamptz,
 revision_before bigint, revision_after bigint
);
alter table public.cp_payroll_import_batches enable row level security;
revoke all on public.cp_payroll_import_batches from public, anon, authenticated;
grant select, insert, update on public.cp_payroll_import_batches to service_role;

create or replace function public.cp_apply_mutasi_fh_import(p_text text,p_revision bigint,p_actor uuid)
returns jsonb language plpgsql set search_path='' as $$
declare
 body jsonb; current_row public.cp_payroll_workspace; old_batch public.cp_payroll_import_batches;
 catalog jsonb; imported jsonb; next_state jsonb; g jsonb; mapped jsonb; saved jsonb;
 employee_check record; games_added integer:=0; result jsonb;
 batch_id constant text:='mutasi-fh-c1b7e68321ee1040';
 payload_hash constant text:='29cacd303628594ef6be047b69bbabbc25f4aa0e60cf9b0c63ae206acdba0662';
begin
 if p_actor is null then raise exception 'Admin diperlukan.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cp_payroll_access:'||p_actor::text,0));
 perform 1 from public.profiles where id=p_actor and lower(trim(role))='admin' for share;
 if not found then raise exception 'Hanya admin yang dapat mengimpor payroll.' using errcode='42501'; end if;
 if p_text is null or octet_length(p_text)>6000000 or encode(sha256(convert_to(p_text,'UTF8')),'hex')<>payload_hash then
  raise exception 'Paket impor tidak sesuai dengan berkas yang telah diperiksa.' using errcode='22023';
 end if;
 body:=p_text::jsonb;
 if body->>'batchId'<>batch_id or jsonb_array_length(body->'orders')<>4404
  or jsonb_array_length(body->'sourceRows')<>4854 then
  raise exception 'Manifest impor tidak sesuai.' using errcode='22023';
 end if;
 select * into strict current_row from public.cp_payroll_workspace where id=1 for update;
 select * into old_batch from public.cp_payroll_import_batches where id=batch_id;
 if found and old_batch.status='applied' then
  return jsonb_build_object('status','already_applied','batchId',batch_id,'revision',current_row.revision,'summary',old_batch.summary);
 end if;
 if p_revision is null or current_row.revision<>p_revision then
  raise exception 'Data payroll berubah. Periksa ulang pratinjau sebelum impor.' using errcode='40001';
 end if;
 if coalesce(current_row.payload->'cp-ofs-demo-period-lock-v1','null'::jsonb)<>'null'::jsonb then
  raise exception 'Payroll sedang dikunci. Buka kunci sebelum impor.' using errcode='55000';
 end if;
 for employee_check in select e->>'code' as code,e->>'name' as name,e->>'team' as team
  from jsonb_array_elements(body->'expectedEmployees') e loop
  if not exists(select 1 from jsonb_array_elements(coalesce(current_row.payload->'cp-ofs-demo-employees-v2','[]'::jsonb)) e
   where e->>'code'=employee_check.code and e->>'name'=employee_check.name and e->>'team'=employee_check.team) then
   raise exception 'Pemetaan karyawan % berubah; impor dibatalkan.',employee_check.code using errcode='22023';
  end if;
 end loop;
 catalog:=coalesce(current_row.payload->'cp-ofs-demo-product-games-v1','[]'::jsonb);
 for g in select value from jsonb_array_elements(body->'games') loop
  select value into mapped from jsonb_array_elements(catalog) where upper(trim(value->>'code'))=upper(g->>'code') limit 1;
  if mapped is null then
   if exists(select 1 from jsonb_array_elements(catalog) where value->>'id'=g->>'id') then
    raise exception 'Identitas game bertabrakan.' using errcode='22023';
   end if;
   catalog:=catalog||jsonb_build_array(g);games_added:=games_added+1;
  end if;
 end loop;
 select jsonb_agg(jsonb_set(o.value,'{gameId}',to_jsonb(g.value->>'id')) order by o.ordinality) into imported
 from jsonb_array_elements(body->'orders') with ordinality o(value,ordinality)
 cross join lateral (select value from jsonb_array_elements(catalog) where upper(trim(value->>'code'))=upper(o.value->>'game') limit 1) g;
 if jsonb_array_length(imported)<>4404 or (select sum((value->>'grossMinor')::numeric) from jsonb_array_elements(imported))<>1575401476 then
  raise exception 'Jumlah atau total pesanan tidak cocok.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(imported) where value->>'operationalStatus'='verified' or value ? 'payrollClosedAt' or value ? 'inventoryAllocations') then
  raise exception 'Impor historis tidak boleh menjalankan gaji, closing, atau stok.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(imported) n
  join jsonb_array_elements(coalesce(current_row.payload->'cp-ofs-demo-user-orders-v3','[]'::jsonb)) o
  on n->>'id'=o->>'id' or lower(trim(n->>'externalReference'))=lower(trim(o->>'externalReference'))) then
  raise exception 'Ada kode pesanan yang sudah tersimpan. Tidak ada data yang ditimpa.' using errcode='23505';
 end if;
 next_state:=jsonb_set(jsonb_set(current_row.payload,'{cp-ofs-demo-product-games-v1}',catalog),
  '{cp-ofs-demo-user-orders-v3}',coalesce(current_row.payload->'cp-ofs-demo-user-orders-v3','[]'::jsonb)||imported);
 if octet_length(next_state::text)>3500000 then
  raise exception 'Ukuran gabungan melebihi kapasitas payroll. Tidak ada data yang berubah.' using errcode='22023';
 end if;
 saved:=public.cp_save_payroll_workspace(current_row.revision,next_state,p_actor,'save');
 result:=(body->'summary')||jsonb_build_object('gamesAddedDuringImport',games_added,'execution','Impor historis selesai; tanpa pembayaran gaji, closing, atau perubahan stok.');
 insert into public.cp_payroll_import_batches(id,source_filename,source_sheet,source_sha256,payload_sha256,summary,payload,status,applied_at,revision_before,revision_after)
 values(batch_id,body#>>'{summary,sourceFile}',body#>>'{summary,sourceSheet}',body#>>'{summary,sourceSha256}',payload_hash,result,body,'applied',clock_timestamp(),current_row.revision,(saved->>'revision')::bigint)
 on conflict(id) do update set summary=excluded.summary,payload=excluded.payload,status=excluded.status,applied_at=excluded.applied_at,
  revision_before=excluded.revision_before,revision_after=excluded.revision_after;
 return jsonb_build_object('status','applied','batchId',batch_id,'revision',saved->'revision','summary',result);
end;
$$;
revoke all on function public.cp_apply_mutasi_fh_import(text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.cp_apply_mutasi_fh_import(text,bigint,uuid) to service_role;

create or replace function public.cp_read_mutasi_fh_archive(p_actor uuid,p_offset integer default 0,p_limit integer default 30,p_review boolean default true)
returns jsonb language plpgsql stable set search_path='' as $$
declare b public.cp_payroll_import_batches; rows jsonb; total integer;
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and (lower(trim(p.role))='admin'
  or exists(select 1 from public.cp_payroll_access a where a.user_id=p_actor and a.active))) then
  raise exception 'Akses payroll diperlukan.' using errcode='42501';
 end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>100 then
  raise exception 'Halaman tidak valid.' using errcode='22023';
 end if;
 select * into b from public.cp_payroll_import_batches where id='mutasi-fh-c1b7e68321ee1040' and status='applied';
 if not found then return jsonb_build_object('status','not_imported','rows','[]'::jsonb,'total',0); end if;
 select count(*) into total from jsonb_array_elements(b.payload->'sourceRows') r
 where not p_review or coalesce(jsonb_array_length(r->'issues'),0)>0 or r->>'kind' in ('review','tip','incomplete');
 select coalesce(jsonb_agg(row_data),'[]'::jsonb) into rows from (
  select r as row_data from jsonb_array_elements(b.payload->'sourceRows') with ordinality s(r,n)
  where not p_review or coalesce(jsonb_array_length(r->'issues'),0)>0 or r->>'kind' in ('review','tip','incomplete')
  order by n offset p_offset limit p_limit
 ) page;
 return jsonb_build_object('status','applied','summary',b.summary,'revision',b.revision_after,'rows',rows,'total',total,'offset',p_offset);
end;
$$;
revoke all on function public.cp_read_mutasi_fh_archive(uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.cp_read_mutasi_fh_archive(uuid,integer,integer,boolean) to service_role;
notify pgrst,'reload schema';
