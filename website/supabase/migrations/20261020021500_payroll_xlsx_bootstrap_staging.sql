create table if not exists public.cp_payroll_xlsx_bootstrap_runs (
  job_id text primary key,
  source_label text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  total_tasks integer not null check (total_tasks between 1 and 10000),
  cursor integer not null default 0 check (cursor >= 0),
  status text not null default 'pending' check (status in ('pending','complete','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cursor <= total_tasks)
);
create table if not exists public.cp_payroll_xlsx_bootstrap_parts (
  job_id text not null references public.cp_payroll_xlsx_bootstrap_runs(job_id) on delete cascade,
  part_no integer not null check (part_no between 0 and 99),
  content text not null check (length(content) between 1 and 8000 and content ~ '^[A-Za-z0-9+/=]+$'),
  primary key(job_id,part_no)
);
alter table public.cp_payroll_xlsx_bootstrap_runs enable row level security;
alter table public.cp_payroll_xlsx_bootstrap_parts enable row level security;
revoke all on public.cp_payroll_xlsx_bootstrap_runs, public.cp_payroll_xlsx_bootstrap_parts from public, anon, authenticated;
grant select, insert, update, delete on public.cp_payroll_xlsx_bootstrap_runs, public.cp_payroll_xlsx_bootstrap_parts to service_role;
