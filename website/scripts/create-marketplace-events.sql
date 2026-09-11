create table if not exists public.marketplace_events (
  id bigserial primary key,
  event_type text not null check (
    event_type in (
      'offer_view',
      'product_view',
      'checkout_start',
      'payment_success',
      'order_complete'
    )
  ),
  user_id uuid null references auth.users(id) on delete set null,
  session_id text null,
  seller_id uuid null references auth.users(id) on delete set null,
  product_id bigint null references public.products(id) on delete set null,
  order_id bigint null references public.orders(id) on delete set null,
  game_slug text null,
  game_name text null,
  category_slug text null,
  category_name text null,
  page_path text null,
  referrer text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_events_event_type_idx
  on public.marketplace_events(event_type);

create index if not exists marketplace_events_seller_created_idx
  on public.marketplace_events(seller_id, created_at desc);

create index if not exists marketplace_events_product_created_idx
  on public.marketplace_events(product_id, created_at desc);

create index if not exists marketplace_events_order_created_idx
  on public.marketplace_events(order_id, created_at desc);

alter table public.marketplace_events enable row level security;

-- Analytics writes are accepted only by validated server routes. Browser roles
-- cannot insert rows directly or forge trusted payment/order events.
drop policy if exists "Anyone can insert marketplace analytics events"
  on public.marketplace_events;
revoke insert, update, delete on public.marketplace_events
  from anon, authenticated;
grant all on public.marketplace_events to service_role;

create policy "Sellers can read their own marketplace analytics events"
  on public.marketplace_events
  for select
  to authenticated
  using (seller_id = auth.uid());
