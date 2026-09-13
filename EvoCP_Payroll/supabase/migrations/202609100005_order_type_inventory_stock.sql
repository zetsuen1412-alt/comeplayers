-- CP-OFS v0.10.0
-- Order type (Gold / Item / Boosting) + per-employee warehouse ownership + stock reservation safety.

alter table public.orders
  add column if not exists order_type text not null default 'boosting';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_order_type_check'
  ) then
    alter table public.orders
      add constraint orders_order_type_check
      check (order_type in ('gold','item','boosting'));
  end if;
end $$;

alter table public.inventory_locations
  add column if not exists employee_id uuid references public.employees(id);

create index if not exists idx_inventory_locations_employee
  on public.inventory_locations(organization_id, employee_id)
  where employee_id is not null;

-- Prevent reserving more stock than is currently available in the employee/location warehouse.
create or replace function public.cp_ofs_guard_inventory_reservation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_on_hand numeric(30,8);
  v_other_reserved numeric(30,8);
begin
  if coalesce(new.status, 'active') <> 'active' then
    return new;
  end if;

  select coalesce(sum(m.quantity_signed), 0)
  into v_on_hand
  from public.inventory_movements m
  where m.organization_id = new.organization_id
    and m.inventory_item_id = new.inventory_item_id
    and m.location_id = new.location_id;

  select coalesce(sum(r.quantity), 0)
  into v_other_reserved
  from public.inventory_reservations r
  where r.organization_id = new.organization_id
    and r.inventory_item_id = new.inventory_item_id
    and r.location_id = new.location_id
    and r.status = 'active'
    and r.id <> new.id;

  if new.quantity > (v_on_hand - v_other_reserved) then
    raise exception 'INSUFFICIENT_INVENTORY: available %, requested %',
      (v_on_hand - v_other_reserved), new.quantity;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cp_ofs_guard_inventory_reservation on public.inventory_reservations;
create trigger trg_cp_ofs_guard_inventory_reservation
before insert or update of inventory_item_id, location_id, quantity, status
on public.inventory_reservations
for each row execute function public.cp_ofs_guard_inventory_reservation();

-- Gold/Item orders must be backed by warehouse reservations that exactly match order quantity.
create or replace function public.cp_ofs_assert_order_item_stock_fully_reserved(p_order_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_order_type text;
  v_required numeric(30,8);
  v_reserved numeric(30,8);
begin
  select o.order_type, oi.quantity
  into v_order_type, v_required
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;

  if v_required is null then
    raise exception 'ORDER_ITEM_NOT_FOUND';
  end if;

  if v_order_type = 'boosting' then
    return;
  end if;

  select coalesce(sum(r.quantity), 0)
  into v_reserved
  from public.inventory_reservations r
  where r.order_item_id = p_order_item_id
    and r.status = 'active';

  if v_reserved <> v_required then
    raise exception 'INVENTORY_ALLOCATION_NOT_COMPLETE: required %, reserved %',
      v_required, v_reserved;
  end if;
end;
$$;

comment on column public.orders.order_type is
'Business-facing order type: gold, item, or boosting. Gold and item require warehouse stock reservation before confirmation.';
comment on column public.inventory_locations.employee_id is
'Optional employee responsible for/holding stock at this warehouse location. FH/team is derived from canonical employee team data.';
comment on function public.cp_ofs_assert_order_item_stock_fully_reserved(uuid) is
'Call before confirming Gold/Item orders so reserved warehouse quantity must exactly equal the order item quantity.';
