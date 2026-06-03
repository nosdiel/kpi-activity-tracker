-- Trackable items: per-location items with an optional active window and POS link.
create table if not exists public.trackable_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_id uuid not null references public.locations(id) on delete cascade,
  active_from date,
  active_to date,
  pos_product text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.trackable_items to authenticated;
grant all on public.trackable_items to service_role;

alter table public.trackable_items enable row level security;

create policy "auth read trackable_items"
  on public.trackable_items for select to authenticated using (true);
create policy "auth write trackable_items"
  on public.trackable_items for insert to authenticated with check (true);
create policy "auth update trackable_items"
  on public.trackable_items for update to authenticated using (true) with check (true);
create policy "auth delete trackable_items"
  on public.trackable_items for delete to authenticated using (true);
