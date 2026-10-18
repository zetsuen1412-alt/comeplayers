-- Keep the buyer identity alongside Telegram workflow metadata.
-- The authoritative value remains the payroll workspace order (including Sheet sync);
-- this snapshot makes queued dispatch rows self-contained and auditable.

alter table public.cp_payroll_telegram_orders
  add column if not exists buyer_name text;

create index if not exists cp_payroll_telegram_orders_buyer_idx
  on public.cp_payroll_telegram_orders(buyer_name);

create or replace function public.cp_telegram_attach_buyer_to_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  buyer text;
  source_order jsonb;
  current_text text;
begin
  if new.order_ref is null or new.payload->>'text' is null
    or new.payload->>'text' like E'%\nBuyer :%' then
    return new;
  end if;

  select source_item into source_order
  from public.cp_payroll_workspace workspace,
    lateral jsonb_array_elements(coalesce(workspace.payload->'cp-ofs-demo-user-orders-v3', '[]'::jsonb)) source_item
  where workspace.id = 1
    and lower(source_item->>'externalReference') = lower(new.order_ref)
  limit 1;
  buyer := nullif(btrim(source_order->>'buyerName'), '');
  if buyer is null then return new; end if;

  current_text := new.payload->>'text';
  new.payload := jsonb_set(new.payload, '{text}', to_jsonb(replace(
    current_text,
    E'\nDivisi :',
    E'\nBuyer : ' || buyer || E'\nDivisi :'
  )), true);
  return new;
end;
$$;

drop trigger if exists cp_payroll_telegram_attach_buyer on public.cp_payroll_telegram_outbox;
create trigger cp_payroll_telegram_attach_buyer
  before insert or update of payload on public.cp_payroll_telegram_outbox
  for each row execute function public.cp_telegram_attach_buyer_to_outbox();

create or replace function public.cp_telegram_sync_buyer_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The workspace trigger that creates/updates Telegram orders runs first. The
  -- z-prefix keeps this trigger after that trigger in PostgreSQL's name order.
  update public.cp_payroll_telegram_orders target
  set buyer_name = nullif(btrim(row_data->>'buyerName'), '')
  from jsonb_array_elements(coalesce(new.payload->'cp-ofs-demo-user-orders-v3', '[]'::jsonb)) row_data
  where lower(target.order_ref) = lower(row_data->>'externalReference')
    and target.buyer_name is distinct from nullif(btrim(row_data->>'buyerName'), '');

  -- A pending outbox row may have been rendered by an older SQL dispatch fallback.
  -- Insert Buyer once, without touching an already-rendered card or its buttons.
  update public.cp_payroll_telegram_outbox outbox
  set payload = jsonb_set(
    outbox.payload,
    '{text}',
    to_jsonb(replace(
      outbox.payload->>'text',
      E'\nDivisi :',
      E'\nBuyer : ' || coalesce(nullif(btrim(row_data->>'buyerName'), ''), '-') || E'\nDivisi :'
    )),
    true
  )
  from jsonb_array_elements(coalesce(new.payload->'cp-ofs-demo-user-orders-v3', '[]'::jsonb)) row_data
  where outbox.order_ref = row_data->>'externalReference'
    and outbox.status = 'pending'
    and (outbox.payload->>'text') is not null
    and (outbox.payload->>'text') not like E'%\nBuyer :%';

  return new;
end;
$$;

drop trigger if exists cp_telegram_z_sync_buyer_snapshot on public.cp_payroll_workspace;
create trigger cp_telegram_z_sync_buyer_snapshot
  after update of payload on public.cp_payroll_workspace
  for each row execute function public.cp_telegram_sync_buyer_snapshot();

-- Populate the snapshot for orders that already exist before this migration.
update public.cp_payroll_telegram_orders target
set buyer_name = nullif(btrim(row_data->>'buyerName'), '')
from public.cp_payroll_workspace workspace,
  lateral jsonb_array_elements(coalesce(workspace.payload->'cp-ofs-demo-user-orders-v3', '[]'::jsonb)) row_data
where workspace.id = 1
  and lower(target.order_ref) = lower(row_data->>'externalReference')
  and target.buyer_name is distinct from nullif(btrim(row_data->>'buyerName'), '');

update public.cp_payroll_telegram_outbox outbox
set payload = jsonb_set(
  outbox.payload,
  '{text}',
  to_jsonb(replace(
    outbox.payload->>'text',
    E'\nDivisi :',
    E'\nBuyer : ' || coalesce(nullif(btrim(row_data->>'buyerName'), ''), '-') || E'\nDivisi :'
  )),
  true
)
from public.cp_payroll_workspace workspace,
  lateral jsonb_array_elements(coalesce(workspace.payload->'cp-ofs-demo-user-orders-v3', '[]'::jsonb)) row_data
where workspace.id = 1
  and outbox.order_ref = row_data->>'externalReference'
  and outbox.status = 'pending'
  and (outbox.payload->>'text') is not null
  and (outbox.payload->>'text') not like E'%\nBuyer :%';

comment on column public.cp_payroll_telegram_orders.buyer_name is
  'Buyer name snapshot from the payroll workspace/Sheet mutation row; never a financial field.';

revoke all on function public.cp_telegram_attach_buyer_to_outbox()
  from public, anon, authenticated;
revoke all on function public.cp_telegram_sync_buyer_snapshot()
  from public, anon, authenticated;
grant execute on function public.cp_telegram_attach_buyer_to_outbox()
  to service_role;
grant execute on function public.cp_telegram_sync_buyer_snapshot()
  to service_role;
