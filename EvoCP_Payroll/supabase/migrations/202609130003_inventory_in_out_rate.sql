-- CP-OFS v0.15.1
-- Stok Masuk / Stok Keluar reporting.
-- The inventory ledger already stores signed quantities. For order-related stock-out rows,
-- keep an optional snapshot of the order's selling rate for operational reporting.

alter table public.inventory_movements
  add column if not exists sale_rate_minor bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_sale_rate_nonnegative'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_sale_rate_nonnegative
      check (sale_rate_minor is null or sale_rate_minor >= 0);
  end if;
end $$;

comment on column public.inventory_movements.sale_rate_minor is
'Optional selling rate snapshot from the related Gold/Item order. Intended for Stok Keluar operational reporting; not inventory cost.';
