create table if not exists recently_viewed_games (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id bigint null,
  game_slug text not null,
  game_name text not null,
  image_url text null,
  viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint recently_viewed_games_user_game_unique unique (user_id, game_slug)
);

create index if not exists idx_recently_viewed_games_user_viewed_at
on recently_viewed_games(user_id, viewed_at desc);

alter table recently_viewed_games enable row level security;

drop policy if exists "Users can view their recently viewed games" on recently_viewed_games;
create policy "Users can view their recently viewed games"
on recently_viewed_games
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their recently viewed games" on recently_viewed_games;
create policy "Users can insert their recently viewed games"
on recently_viewed_games
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their recently viewed games" on recently_viewed_games;
create policy "Users can update their recently viewed games"
on recently_viewed_games
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their recently viewed games" on recently_viewed_games;
create policy "Users can delete their recently viewed games"
on recently_viewed_games
for delete
using (auth.uid() = user_id);
