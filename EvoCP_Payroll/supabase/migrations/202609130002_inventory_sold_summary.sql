-- CP-OFS v0.15.0
-- Reporting helper for cumulative stock sold/consumed by order fulfillment.
-- Inventory remains movement-ledger based; sold quantity is derived, not manually overwritten.

create or replace view public.v_inventory_sold_summary as
select
  organization_id,
  inventory_item_id,
  location_id,
  coalesce(sum(abs(quantity_signed)) filter (
    where quantity_signed < 0
      and (
        reference_type in ('order_item', 'order_fulfillment')
        or movement_type in ('sale', 'sold', 'order_fulfillment', 'consume_order')
      )
  ), 0)::numeric(30,8) as sold_quantity
from public.inventory_movements
group by organization_id, inventory_item_id, location_id;

comment on view public.v_inventory_sold_summary is
'Cumulative sold/consumed inventory quantity derived from negative order-fulfillment movements. Do not edit sold stock directly.';
