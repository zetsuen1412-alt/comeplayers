-- Read the most recently applied MUTASI FH import, including date-scoped imports.
-- This migration reads no private workbook bytes and imports or deletes no orders.
create or replace function public.cp_read_mutasi_fh_archive(
  p_actor uuid, p_offset integer default 0, p_limit integer default 30, p_review boolean default true
) returns jsonb language plpgsql stable set search_path='' as $$
declare
  b public.cp_payroll_import_batches;
  rows jsonb;
  total integer;
begin
  if not exists (
    select 1 from public.profiles p where p.id=p_actor and (
      lower(trim(p.role))='admin' or exists (
        select 1 from public.cp_payroll_access a where a.user_id=p_actor and a.active
      )
    )
  ) then raise exception 'Akses payroll diperlukan.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>100 then
    raise exception 'Halaman tidak valid.' using errcode='22023';
  end if;
  select * into b from public.cp_payroll_import_batches
  where source_sheet='MUTASI FH' and id like 'mutasi-fh-%' and status='applied'
  order by applied_at desc nulls last, created_at desc, id desc limit 1;
  if not found then
    return jsonb_build_object('status','not_imported','rows','[]'::jsonb,'total',0);
  end if;
  select count(*) into total from jsonb_array_elements(b.payload->'sourceRows') r
  where not p_review or coalesce(jsonb_array_length(r->'issues'),0)>0 or r->>'kind' in ('review','tip','incomplete');
  select coalesce(jsonb_agg(row_data order by n),'[]'::jsonb) into rows from (
    select r as row_data,n from jsonb_array_elements(b.payload->'sourceRows') with ordinality s(r,n)
    where not p_review or coalesce(jsonb_array_length(r->'issues'),0)>0 or r->>'kind' in ('review','tip','incomplete')
    order by n offset p_offset limit p_limit
  ) page;
  return jsonb_build_object('status','applied','batchId',b.id,'summary',b.summary,
    'revision',b.revision_after,'rows',rows,'total',total,'offset',p_offset);
end;
$$;
revoke all on function public.cp_read_mutasi_fh_archive(uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.cp_read_mutasi_fh_archive(uuid,integer,integer,boolean) to service_role;
notify pgrst,'reload schema';
