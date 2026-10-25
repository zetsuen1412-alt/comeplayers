-- Separate FH3 Discord buyer alerts. No Payroll, employee, wage or Closing rewrites.
create table public.cp_fh3_discord_order_bindings (
  order_ref text primary key references public.cp_fh3_telegram_manual_orders(order_ref),
  guild_id text not null check (guild_id ~ '^[0-9]{15,22}$'),
  channel_id text not null check (channel_id ~ '^[0-9]{15,22}$'),
  buyer_user_id text not null check (buyer_user_id ~ '^[0-9]{15,22}$'),
  enabled boolean not null default true,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index cp_fh3_discord_bindings_channel
  on public.cp_fh3_discord_order_bindings(guild_id,channel_id,buyer_user_id)
  where enabled;

create table public.cp_fh3_discord_alert_events (
  message_id text not null check (message_id ~ '^[0-9]{15,22}$'),
  order_ref text not null references public.cp_fh3_discord_order_bindings(order_ref),
  guild_id text not null check (guild_id ~ '^[0-9]{15,22}$'),
  channel_id text not null check (channel_id ~ '^[0-9]{15,22}$'),
  created_at timestamptz not null default now(),
  primary key (message_id,order_ref)
);
create index cp_fh3_discord_events_recent
  on public.cp_fh3_discord_alert_events(created_at desc);

alter table public.cp_fh3_discord_order_bindings enable row level security;
alter table public.cp_fh3_discord_alert_events enable row level security;
revoke all on public.cp_fh3_discord_order_bindings,public.cp_fh3_discord_alert_events
  from public,anon,authenticated,service_role;
grant select,insert,update on public.cp_fh3_discord_order_bindings to service_role;
grant select,insert on public.cp_fh3_discord_alert_events to service_role;
-- No direct browser/device access: authenticated users must use the scoped Monitor APIs.
-- No DELETE/TRUNCATE privileges on historical alerts.
