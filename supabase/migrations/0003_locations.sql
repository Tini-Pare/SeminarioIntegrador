create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Backfill from the free-text values equipment.location already had.
insert into locations (name)
select distinct location from equipment;

alter table equipment add column location_id uuid references locations(id);

update equipment e
set location_id = l.id
from locations l
where l.name = e.location;

-- No ON DELETE CASCADE on purpose: deleting a location with equipment still
-- assigned to it must fail loudly (FK violation) rather than silently
-- orphan/cascade-delete equipment.
alter table equipment alter column location_id set not null;
alter table equipment drop column location;

grant select, insert, update, delete on locations to authenticated;

alter table locations enable row level security;

create policy "locations: any authenticated read" on locations
  for select using (auth.uid() is not null);

create policy "locations: admin inserts" on locations
  for insert with check (current_role_name() = 'admin');

create policy "locations: admin updates" on locations
  for update using (current_role_name() = 'admin');

create policy "locations: admin deletes" on locations
  for delete using (current_role_name() = 'admin');
