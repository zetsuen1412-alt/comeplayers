-- Telegram operations for ComePlayers Payroll.
-- Files remain stored in Telegram; ComePlayers stores only references and workflow metadata.

create table if not exists public.cp_payroll_telegram_divisions (
  division text primary key check (division in ('FH1','FH2','FH3','ADMIN','BANDAR')),
  chat_id bigint not null unique,
  chat_title text,
  chat_username text,
  active boolean not null default true,
  bound_by_telegram_user_id bigint,
  updated_at timestamptz not null default now()
);

create table if not exists public.cp_payroll_telegram_employees (
  employee_code text primary key,
  telegram_user_id bigint not null unique,
  telegram_username text,
  telegram_name text,
  division text not null check (division in ('FH1','FH2','FH3','ADMIN','BANDAR')),
  role text not null default 'worker' check (role in ('worker','leader')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.cp_payroll_telegram_orders (
  order_ref text primary key,
  order_type text not null check (order_type in ('boosting','gold','item')),
  target_quantity numeric not null default 0 check (target_quantity >= 0),
  delivered_quantity numeric not null default 0 check (delivered_quantity >= 0),
  state text not null default 'waiting' check (state in ('waiting','assigned','in_progress','paused','problem','done_pending_admin')),
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cp_payroll_telegram_order_chats (
  order_ref text not null references public.cp_payroll_telegram_orders(order_ref) on delete cascade,
  division text not null check (division in ('FH1','FH2','FH3','ADMIN','BANDAR')),
  chat_id bigint not null,
  message_id bigint,
  created_at timestamptz not null default now(),
  primary key (order_ref, division)
);

create table if not exists public.cp_payroll_telegram_assignments (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null references public.cp_payroll_telegram_orders(order_ref) on delete cascade,
  employee_code text not null,
  division text not null check (division in ('FH1','FH2','FH3','ADMIN','BANDAR')),
  telegram_user_id bigint,
  status text not null default 'assigned' check (status in ('assigned','in_progress','paused','done','replaced','problem')),
  quantity numeric,
  started_at timestamptz,
  paused_at timestamptz,
  done_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cp_payroll_telegram_active_boost_assignment
on public.cp_payroll_telegram_assignments(order_ref)
where status in ('assigned','in_progress','paused','problem');

create index if not exists cp_payroll_telegram_assignments_order_idx
on public.cp_payroll_telegram_assignments(order_ref, created_at);

create table if not exists public.cp_payroll_telegram_sessions (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  chat_id bigint not null,
  order_ref text not null references public.cp_payroll_telegram_orders(order_ref) on delete cascade,
  assignment_id uuid references public.cp_payroll_telegram_assignments(id) on delete cascade,
  kind text not null check (kind in ('start','done','gold')),
  stage text not null check (stage in ('amount','evidence')),
  requested_quantity numeric,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  unique (telegram_user_id, chat_id)
);

create table if not exists public.cp_payroll_telegram_gold_contributions (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null references public.cp_payroll_telegram_orders(order_ref) on delete cascade,
  employee_code text not null,
  division text not null check (division in ('FH1','FH2','FH3','ADMIN','BANDAR')),
  telegram_user_id bigint not null,
  requested_quantity numeric not null check (requested_quantity > 0),
  accepted_quantity numeric not null check (accepted_quantity >= 0),
  created_at timestamptz not null default now()
);

create index if not exists cp_payroll_telegram_gold_order_idx
on public.cp_payroll_telegram_gold_contributions(order_ref, created_at);

create table if not exists public.cp_payroll_telegram_evidence (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null references public.cp_payroll_telegram_orders(order_ref) on delete cascade,
  assignment_id uuid references public.cp_payroll_telegram_assignments(id) on delete set null,
  contribution_id uuid references public.cp_payroll_telegram_gold_contributions(id) on delete set null,
  session_id uuid references public.cp_payroll_telegram_sessions(id) on delete set null,
  evidence_type text not null check (evidence_type in ('start','done','gold')),
  media_type text not null check (media_type in ('photo','video')),
  telegram_chat_id bigint not null,
  telegram_chat_username text,
  telegram_message_id bigint not null,
  telegram_file_id text not null,
  telegram_file_unique_id text not null,
  telegram_user_id bigint not null,
  created_at timestamptz not null default now(),
  unique (telegram_chat_id, telegram_message_id, telegram_file_unique_id)
);

create index if not exists cp_payroll_telegram_evidence_order_idx
on public.cp_payroll_telegram_evidence(order_ref, created_at);

alter table public.cp_payroll_telegram_divisions enable row level security;
alter table public.cp_payroll_telegram_employees enable row level security;
alter table public.cp_payroll_telegram_orders enable row level security;
alter table public.cp_payroll_telegram_order_chats enable row level security;
alter table public.cp_payroll_telegram_assignments enable row level security;
alter table public.cp_payroll_telegram_sessions enable row level security;
alter table public.cp_payroll_telegram_gold_contributions enable row level security;
alter table public.cp_payroll_telegram_evidence enable row level security;

revoke all on public.cp_payroll_telegram_divisions from public, anon, authenticated;
revoke all on public.cp_payroll_telegram_employees from public, anon, authenticated;
revoke all on public.cp_payroll_telegram_orders from public, anon, authenticated;
revoke all on public.cp_payroll_telegram_order_chats from public, anon, authenticated;
revoke all on public.cp_payroll_telegram_assignments from public, anon, authenticated;
revoke all on public.cp_payroll_telegram_sessions from public, anon, authenticated;
revoke all on public.cp_payroll_telegram_gold_contributions from public, anon, authenticated;
revoke all on public.cp_payroll_telegram_evidence from public, anon, authenticated;

grant select, insert, update, delete on public.cp_payroll_telegram_divisions to service_role;
grant select, insert, update, delete on public.cp_payroll_telegram_employees to service_role;
grant select, insert, update, delete on public.cp_payroll_telegram_orders to service_role;
grant select, insert, update, delete on public.cp_payroll_telegram_order_chats to service_role;
grant select, insert, update, delete on public.cp_payroll_telegram_assignments to service_role;
grant select, insert, update, delete on public.cp_payroll_telegram_sessions to service_role;
grant select, insert, update, delete on public.cp_payroll_telegram_gold_contributions to service_role;
grant select, insert, update, delete on public.cp_payroll_telegram_evidence to service_role;

create or replace function public.cp_payroll_telegram_accept_gold(
  p_order_ref text,
  p_employee_code text,
  p_division text,
  p_telegram_user_id bigint,
  p_requested_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.cp_payroll_telegram_orders;
  remaining numeric;
  accepted numeric;
  contribution_id uuid;
begin
  if p_requested_quantity is null or p_requested_quantity <= 0 then
    raise exception 'Jumlah Gold harus lebih dari 0.' using errcode='22023';
  end if;

  select * into current_order
  from public.cp_payroll_telegram_orders
  where order_ref = p_order_ref
  for update;

  if not found then
    raise exception 'Order Telegram tidak ditemukan.' using errcode='P0002';
  end if;
  if current_order.order_type <> 'gold' then
    raise exception 'Order ini bukan order Gold.' using errcode='22023';
  end if;

  remaining := greatest(current_order.target_quantity - current_order.delivered_quantity, 0);
  accepted := least(p_requested_quantity, remaining);

  if accepted <= 0 then
    return jsonb_build_object(
      'accepted', 0,
      'requested', p_requested_quantity,
      'delivered', current_order.delivered_quantity,
      'target', current_order.target_quantity,
      'remaining', 0,
      'full', true
    );
  end if;

  insert into public.cp_payroll_telegram_gold_contributions(
    order_ref, employee_code, division, telegram_user_id, requested_quantity, accepted_quantity
  ) values (
    p_order_ref, p_employee_code, p_division, p_telegram_user_id, p_requested_quantity, accepted
  ) returning id into contribution_id;

  update public.cp_payroll_telegram_orders
  set delivered_quantity = delivered_quantity + accepted,
      state = case when delivered_quantity + accepted >= target_quantity then 'done_pending_admin' else 'in_progress' end,
      last_event_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where order_ref = p_order_ref
  returning * into current_order;

  return jsonb_build_object(
    'contributionId', contribution_id,
    'accepted', accepted,
    'requested', p_requested_quantity,
    'delivered', current_order.delivered_quantity,
    'target', current_order.target_quantity,
    'remaining', greatest(current_order.target_quantity - current_order.delivered_quantity, 0),
    'full', current_order.delivered_quantity >= current_order.target_quantity
  );
end;
$$;

revoke all on function public.cp_payroll_telegram_accept_gold(text,text,text,bigint,numeric) from public, anon, authenticated;
grant execute on function public.cp_payroll_telegram_accept_gold(text,text,text,bigint,numeric) to service_role;
