-- Supersede the unpublished V1 packet, preserving the reviewed transaction,
-- administrator check, row lock, revision guard, private archive, and grants.
-- This changes no orders or financial values by itself.
do $migration$
declare
  definition text;
  old_hash constant text := '29cacd303628594ef6be047b69bbabbc25f4aa0e60cf9b0c63ae206acdba0662';
  new_hash constant text := '762b1d97ca171bf221a7c32f74ec8d63b0b0bf7b7da457513419e7f384231ebb';
begin
  if exists (select 1 from public.cp_payroll_import_batches
    where id='mutasi-fh-c1b7e68321ee1040' and status='applied'
    and coalesce((summary->>'mappingVersion')::integer,1)<>2) then
    raise exception 'A previous import was applied. Review a separate correction; do not import twice.';
  end if;
  select pg_get_functiondef('public.cp_apply_mutasi_fh_import(text,bigint,uuid)'::regprocedure) into definition;
  if position(old_hash in definition)>0 then
    execute replace(definition,old_hash,new_hash);
  elsif position(new_hash in definition)=0 then
    raise exception 'Unexpected import function version. Refusing to overwrite it.';
  end if;
end;
$migration$;
notify pgrst,'reload schema';
