create table if not exists public.recently_viewed (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists idx_recently_viewed_user_viewed_at
on public.recently_viewed(user_id, viewed_at desc);

alter table public.recently_viewed enable row level security;

drop policy if exists "Users can read own recently viewed" on public.recently_viewed;
create policy "Users can read own recently viewed"
on public.recently_viewed
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own recently viewed" on public.recently_viewed;
create policy "Users can insert own recently viewed"
on public.recently_viewed
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own recently viewed" on public.recently_viewed;
create policy "Users can update own recently viewed"
on public.recently_viewed
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own recently viewed" on public.recently_viewed;
create policy "Users can delete own recently viewed"
on public.recently_viewed
for delete
using (auth.uid() = user_id);
