-- CP-OFS v0.9.0
-- Automatic order codes + multi-worker allocation safety.

create table if not exists public.order_code_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_value bigint not null default 0 check (last_value between 0 and 269973),
  updated_at timestamptz not null default now()
);

alter table public.order_code_sequences enable row level security;
-- No direct browser policy: codes are issued only through the audited server/domain action.

create or replace function public.cp_ofs_order_code_from_index(p_index bigint)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_offset bigint;
  v_letter_index integer;
  v_suffix integer;
  v_letter text;
begin
  if p_index < 1 or p_index > 269973 then
    raise exception 'ORDER_CODE_SEQUENCE_EXHAUSTED';
  end if;

  if p_index <= 9999 then
    return 'EG' || p_index::text;
  end if;

  v_offset := p_index - 10000;
  v_letter_index := floor(v_offset / 9999)::integer;
  v_suffix := (v_offset % 9999)::integer + 1;
  v_letter := chr(65 + v_letter_index);
  return 'EG' || v_letter || lpad(v_suffix::text, 4, '0');
end;
$$;

create or replace function public.cp_ofs_next_order_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  insert into public.order_code_sequences (organization_id, last_value, updated_at)
  values (p_organization_id, 1, now())
  on conflict (organization_id)
  do update set
    last_value = public.order_code_sequences.last_value + 1,
    updated_at = now()
  returning last_value into v_next;

  if v_next > 269973 then
    raise exception 'ORDER_CODE_SEQUENCE_EXHAUSTED';
  end if;

  return public.cp_ofs_order_code_from_index(v_next);
end;
$$;

alter table public.order_allocations
  add column if not exists process_snapshot text not null default 'JOKI';

create or replace function public.cp_ofs_guard_order_allocation_quantity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_required numeric(30,8);
  v_other_assigned numeric(30,8);
begin
  select quantity
  into v_required
  from public.order_items
  where id = new.order_item_id
  for update;

  if v_required is null then
    raise exception 'ORDER_ITEM_NOT_FOUND';
  end if;

  select coalesce(sum(a.assigned_quantity), 0)
  into v_other_assigned
  from public.order_allocations a
  where a.order_item_id = new.order_item_id
    and a.id <> new.id
    and coalesce(a.status, '') <> 'cancelled';

  if coalesce(new.status, '') <> 'cancelled'
     and v_other_assigned + new.assigned_quantity > v_required then
    raise exception 'ORDER_OVER_ALLOCATED: required %, attempted total %',
      v_required, v_other_assigned + new.assigned_quantity;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cp_ofs_guard_order_allocation_quantity on public.order_allocations;
create trigger trg_cp_ofs_guard_order_allocation_quantity
before insert or update of order_item_id, assigned_quantity, status
on public.order_allocations
for each row execute function public.cp_ofs_guard_order_allocation_quantity();

create or replace function public.cp_ofs_assert_order_item_fully_allocated(p_order_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_required numeric(30,8);
  v_assigned numeric(30,8);
begin
  select quantity into v_required
  from public.order_items
  where id = p_order_item_id;

  if v_required is null then
    raise exception 'ORDER_ITEM_NOT_FOUND';
  end if;

  select coalesce(sum(assigned_quantity), 0)
  into v_assigned
  from public.order_allocations
  where order_item_id = p_order_item_id
    and coalesce(status, '') <> 'cancelled';

  if v_assigned <> v_required then
    raise exception 'ORDER_ALLOCATION_NOT_COMPLETE: required %, assigned %', v_required, v_assigned;
  end if;
end;
$$;

comment on function public.cp_ofs_next_order_code(uuid) is
'Issues per-organization codes EG1..EG9999, then EGA0001..EGZ9999 using an atomic sequence row.';
comment on function public.cp_ofs_assert_order_item_fully_allocated(uuid) is
'Call before final order confirmation so total worker assigned quantity must exactly equal the order item quantity.';
