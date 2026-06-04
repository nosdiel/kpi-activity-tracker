-- Async job tracking for Toast Analytics Menu reports.
create table if not exists public.toast_report_jobs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  report_type text not null,
  report_request_guid text,
  status text not null default 'pending' check (status in ('pending','ready','failed','rate_limited')),
  rows jsonb,
  error text,
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists toast_report_jobs_loc_date_type_idx
  on public.toast_report_jobs (location_id, business_date, report_type);

create index if not exists toast_report_jobs_status_idx
  on public.toast_report_jobs (status, updated_at);

grant select on public.toast_report_jobs to authenticated;
grant all on public.toast_report_jobs to service_role;

alter table public.toast_report_jobs enable row level security;

drop policy if exists "Authenticated read toast_report_jobs" on public.toast_report_jobs;
create policy "Authenticated read toast_report_jobs"
  on public.toast_report_jobs
  for select
  to authenticated
  using (true);
