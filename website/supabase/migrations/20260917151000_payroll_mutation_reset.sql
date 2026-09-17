-- Install the feature only. No function is invoked and no payroll record is deleted.
create table if not exists public.cp_payroll_mutation_resets (
  id uuid primary key,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  revision_before bigint not null,
  revision_after bigint not null,
  removed_count integer not null check (removed_count > 0),
  total_minor numeric not null,
  before_data jsonb not null check (jsonb_typeof(before_data) = 'object'),
  import_batches jsonb not null check (jsonb_typeof(import_batches) = 'array')
);
alter table public.cp_payroll_mutation_resets enable row level security;
revoke all on public.cp_payroll_mutation_resets from public, anon, authenticated;
grant select, insert on public.cp_payroll_mutation_resets to service_role;

-- Retain the source archive while making an explicitly cleared batch importable again.
alter table public.cp_payroll_import_batches drop constraint if exists cp_payroll_import_batches_status_check;
alter table public.cp_payroll_import_batches add constraint cp_payroll_import_batches_status_check check (status in ('staged', 'applied', 'cleared'));

create or replace function public.cp_reset_payroll_mutations(
  p_revision bigint, p_expected_count integer, p_request_id uuid, p_actor uuid, p_confirmation text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  current_row public.cp_payroll_workspace;
  receipt public.cp_payroll_mutation_resets;
  orders jsonb; archived_batches jsonb; next_state jsonb; saved jsonb;
  removed integer; gross numeric;
begin
  if p_actor is null then raise exception 'Admin diperlukan.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cp_payroll_access:' || p_actor::text, 0));
  perform 1 from public.profiles where id=p_actor and lower(trim(role))='admin' for share;
  if not found then raise exception 'Hanya admin yang dapat menghapus semua mutasi.' using errcode='42501'; end if;
  if p_request_id is null or p_revision is null or p_revision<0 or p_expected_count is null or p_expected_count<1
    or p_confirmation is distinct from 'HAPUS SEMUA MUTASI' then
    raise exception 'Konfirmasi penghapusan tidak valid.' using errcode='22023';
  end if;
  select * into strict current_row from public.cp_payroll_workspace where id=1 for update;
  select * into receipt from public.cp_payroll_mutation_resets where id=p_request_id;
  if found then
    if receipt.actor_id<>p_actor or receipt.revision_before<>p_revision or receipt.removed_count<>p_expected_count then
      raise exception 'Identitas permintaan sudah digunakan.' using errcode='22023';
    end if;
    return jsonb_build_object('status','already_cleared','receiptId',receipt.id,'removedCount',receipt.removed_count,
      'state',current_row.payload,'revision',current_row.revision,'updatedAt',current_row.updated_at);
  end if;
  if current_row.revision<>p_revision then
    raise exception 'Data berubah. Buka ulang ringkasan penghapusan.' using errcode='40001';
  end if;
  if coalesce(current_row.payload->'cp-ofs-demo-period-lock-v1','null'::jsonb)<>'null'::jsonb then
    raise exception 'Payroll sedang dikunci. Buka kunci sebelum menghapus.' using errcode='55000';
  end if;
  orders:=coalesce(current_row.payload->'cp-ofs-demo-user-orders-v3','[]'::jsonb);
  removed:=jsonb_array_length(orders);
  if removed<>p_expected_count or removed=0 then
    raise exception 'Jumlah mutasi berubah atau sudah kosong.' using errcode='40001';
  end if;
  if exists (select 1 from jsonb_array_elements(orders) o where
    nullif(o->>'payrollClosedAt','') is not null or nullif(o->>'payrollPeriodId','') is not null or o->>'financeStatus'='closed'
    or exists (select 1 from jsonb_array_elements(coalesce(current_row.payload->'cp-ofs-demo-closing-v1','[]'::jsonb)) c
      where exists(select 1 from jsonb_array_elements_text(coalesce(c->'orderRefs','[]'::jsonb)) r where lower(trim(r))=lower(trim(o->>'externalReference')))
      or exists(select 1 from jsonb_array_elements(coalesce(c->'ordersSnapshot','[]'::jsonb)) s where s->>'id'=o->>'id'))) then
    raise exception 'Ada pesanan yang terkait Tutup Buku. Penghapusan diblokir.' using errcode='55000';
  end if;
  if exists (select 1 from jsonb_array_elements(orders) o where
    nullif(o->>'inventoryConsumedAt','') is not null or jsonb_array_length(coalesce(nullif(o->'inventoryAllocations','null'::jsonb),'[]'::jsonb))>0
    or exists(select 1 from jsonb_array_elements(coalesce(current_row.payload->'cp-ofs-demo-inventory-movements-v1','[]'::jsonb)) m
      where lower(trim(m->>'orderReference'))=lower(trim(o->>'externalReference')))) then
    raise exception 'Ada pesanan yang terkait stok. Koreksi stok sebelum penghapusan massal.' using errcode='55000';
  end if;
  if exists(select 1 from jsonb_array_elements(orders) o where coalesce((o->>'matchedPaymentMinor')::numeric,0)>0 or o->>'financeStatus' in ('reconciled','ready_to_close')) then
    raise exception 'Ada pesanan yang terkait pencocokan pembayaran.' using errcode='55000';
  end if;
  select coalesce(sum((o->>'grossMinor')::numeric),0) into gross from jsonb_array_elements(orders) o;
  select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) into archived_batches from public.cp_payroll_import_batches b where b.status='applied';
  next_state:=jsonb_set(current_row.payload,'{cp-ofs-demo-user-orders-v3}','[]'::jsonb);
  -- cp_save atomically increments the revision and stores attributed before/after audit snapshots.
  saved:=public.cp_save_payroll_workspace(current_row.revision,next_state,p_actor,'save');
  insert into public.cp_payroll_mutation_resets(id,actor_id,revision_before,revision_after,removed_count,total_minor,before_data,import_batches)
    values(p_request_id,p_actor,current_row.revision,(saved->>'revision')::bigint,removed,gross,current_row.payload,archived_batches);
  update public.cp_payroll_import_batches set status='cleared' where status='applied';
  return saved||jsonb_build_object('status','cleared','receiptId',p_request_id,'removedCount',removed);
end;
$$;
revoke all on function public.cp_reset_payroll_mutations(bigint,integer,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.cp_reset_payroll_mutations(bigint,integer,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
