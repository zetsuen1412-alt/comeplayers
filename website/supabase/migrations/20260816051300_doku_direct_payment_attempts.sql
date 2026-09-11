begin;

create table if not exists public.doku_payment_attempts (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  buyer_id uuid not null,
  payment_type text not null,
  invoice_number text not null,
  provider_request_id text,
  virtual_account_number text,
  how_to_pay_url text,
  expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doku_payment_attempts_payment_type_check
    check (payment_type in ('virtual_account')),
  constraint doku_payment_attempts_status_check
    check (status in ('creating', 'active', 'paid', 'expired', 'failed')),
  constraint doku_payment_attempts_order_method_key
    unique (order_id, payment_type),
  constraint doku_payment_attempts_invoice_key
    unique (invoice_number)
);

create index if not exists doku_payment_attempts_expires_idx
  on public.doku_payment_attempts (status, expires_at);

alter table public.doku_payment_attempts enable row level security;

revoke all on table public.doku_payment_attempts
  from public, anon, authenticated;
revoke all on sequence public.doku_payment_attempts_id_seq
  from public, anon, authenticated;

grant select, insert, update, delete on table public.doku_payment_attempts
  to service_role;
grant usage, select on sequence public.doku_payment_attempts_id_seq
  to service_role;

comment on table public.doku_payment_attempts is
  'Server-only DOKU direct-payment instructions. Access is restricted to service_role.';

commit;
