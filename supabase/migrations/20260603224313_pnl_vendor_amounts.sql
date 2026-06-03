-- Weekly PNL vendor amounts: one row per location/week/vendor.
create table if not exists public.weekly_pnl_vendor_amounts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  fiscal_year int not null,
  fiscal_week int not null,
  vendor_id uuid not null references public.pnl_vendors(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, fiscal_year, fiscal_week, vendor_id)
);

grant select, insert, update, delete on public.weekly_pnl_vendor_amounts to authenticated;
grant all on public.weekly_pnl_vendor_amounts to service_role;

alter table public.weekly_pnl_vendor_amounts enable row level security;

drop policy if exists "wpva auth all" on public.weekly_pnl_vendor_amounts;
create policy "wpva auth all"
  on public.weekly_pnl_vendor_amounts
  for all
  to authenticated
  using (true)
  with check (true);

-- Seed default vendors (global: location_id NULL) if not present.
insert into public.pnl_vendors (name, section, sort_order, active, location_id)
select v.name, v.section, v.sort_order, true, null
from (values
  ('Sysco',             'food_cost',      10),
  ('The Cafe Group',    'food_cost',      20),
  ('CBI',               'food_cost',      30),
  ('All Coffee',        'food_cost',      40),
  ('Cortes (Soda)',     'food_cost',      50),
  ('CP Oil (Veg, Oil)', 'food_cost',      60),
  ('Vicky Enterprises', 'food_cost',      70),
  ('Joy''s Kitchen',    'food_cost',      80),
  ('All Florida Paper', 'paper_supplies', 10),
  ('Dade Paper',        'paper_supplies', 20)
) as v(name, section, sort_order)
where not exists (
  select 1 from public.pnl_vendors p where p.name = v.name and p.section = v.section
);
