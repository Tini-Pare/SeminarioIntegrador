create extension if not exists pgcrypto;

create type role_t as enum ('admin', 'technician', 'user');
create type equipment_status_t as enum ('operational', 'waiting', 'repair');
create type urgency_t as enum ('low', 'medium', 'high');
create type fault_status_t as enum ('new', 'assigned', 'in_progress', 'resolved');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  area text,
  role role_t not null default 'user',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null,
  location text not null,
  status equipment_status_t not null default 'operational',
  last_maintenance date,
  next_maintenance date,
  created_at timestamptz not null default now()
);

create table faults (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  reported_by uuid not null references profiles(id),
  description text not null,
  urgency urgency_t not null default 'medium',
  status fault_status_t not null default 'new',
  technician_id uuid references profiles(id),
  photo_url text,
  created_at timestamptz not null default now()
);

create table history (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  type text not null,
  note text not null,
  author_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table maintenance_plan (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  task text not null,
  frequency text not null,
  date date
);

-- Grants (required in addition to RLS policies below — Postgres checks
-- table-level GRANTs before evaluating RLS; without these, "Automatically
-- expose new tables" off at project creation leaves authenticated with
-- no access at all, regardless of the policies)
grant usage on schema public to authenticated;
grant select on equipment, maintenance_plan to authenticated;
grant select, insert on history to authenticated;
grant insert, update, delete on equipment to authenticated;
grant select, insert, update on faults to authenticated;
grant select, update on profiles to authenticated;

-- The invite-user/delete-user Edge Functions authenticate with the
-- SB_SECRET_KEY (new-style secret API key), which on projects created
-- under Supabase's newer key system does NOT automatically inherit the
-- legacy service_role bypass-everything behavior for table grants — only
-- for RLS bypass. Without this explicit grant, both functions' own
-- admin-role check (a plain SELECT on profiles) fails with "permission
-- denied for table profiles", which surfaces in the app as a generic
-- "Forbidden — admin only" even for a real admin.
grant select, insert, update, delete on profiles to service_role;

-- RLS
alter table profiles enable row level security;
alter table equipment enable row level security;
alter table faults enable row level security;
alter table history enable row level security;
alter table maintenance_plan enable row level security;

-- security definer: bypasses RLS for its own internal query. Required
-- because this function is called FROM the profiles RLS policy itself —
-- without security definer, checking any row other than the caller's own
-- (id != auth.uid()) recurses into profiles' RLS again via this same
-- function and Postgres errors out with "stack depth limit exceeded".
create function current_role_name() returns role_t
language sql stable security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

-- Broad read like equipment/history/faults — internal small-team app, no
-- sensitive data (passwords live in auth.users, not here). Any authenticated
-- user needs to resolve OTHER people's names (who reported/resolved a fault
-- in Historial, who's assigned in Solicitudes) — restricting to self only
-- left those as permanently "Desconocido" for non-admin/technician viewers.
create policy "profiles: any authenticated read" on profiles
  for select using (auth.uid() is not null);

create policy "profiles: admin updates any" on profiles
  for update using (current_role_name() = 'admin');

create policy "equipment: any authenticated read" on equipment
  for select using (auth.uid() is not null);

create policy "equipment: admin inserts" on equipment
  for insert with check (current_role_name() = 'admin');

create policy "equipment: admin deletes" on equipment
  for delete using (current_role_name() = 'admin');

create policy "equipment: admin updates" on equipment
  for update using (current_role_name() = 'admin');

create policy "faults: read own, assigned, or admin/technician" on faults
  for select using (
    reported_by = auth.uid()
    or technician_id = auth.uid()
    or current_role_name() in ('admin', 'technician')
  );

create policy "faults: user inserts own report" on faults
  for insert with check (reported_by = auth.uid());

create policy "faults: technician/admin update" on faults
  for update using (current_role_name() in ('admin', 'technician'));

create policy "history: any authenticated read" on history
  for select using (auth.uid() is not null);

-- Logged automatically by the app (createFault, advanceStatus on resolve) —
-- checking author_id = auth.uid() is enough, no one can log an entry as
-- someone else.
create policy "history: authenticated insert own" on history
  for insert with check (author_id = auth.uid());

create policy "maintenance_plan: any authenticated read" on maintenance_plan
  for select using (auth.uid() is not null);

-- Keeps equipment.status in sync with its own active faults: 'repair' if any
-- fault is in_progress, 'waiting' if any fault is open but untouched
-- (new/assigned), otherwise 'operational'. security definer because a plain
-- 'user' reporting a fault needs this to run even though users can't
-- otherwise update equipment directly (RLS on equipment restricts UPDATE to
-- admin) — this function only ever touches the status column, computed from
-- data it reads itself, so it's safe to expose broadly. Not editable by hand
-- anywhere in the app — this function is the only writer.
create function sync_equipment_status(p_equipment_id uuid) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_status equipment_status_t;
begin
  select case
    when exists (
      select 1 from faults where equipment_id = p_equipment_id and status = 'in_progress'
    ) then 'repair'
    when exists (
      select 1 from faults where equipment_id = p_equipment_id and status in ('new', 'assigned')
    ) then 'waiting'
    else 'operational'
  end into v_status;

  update equipment set status = v_status where id = p_equipment_id;
end;
$$;

grant execute on function sync_equipment_status(uuid) to authenticated;

-- Storage bucket for fault photos, uploaded already-compressed as webp from
-- the client. Public read (so <Image> can load photo_url directly), write
-- restricted to authenticated users.
insert into storage.buckets (id, name, public)
values ('fault-photos', 'fault-photos', true)
on conflict (id) do nothing;

create policy "fault-photos: public read" on storage.objects
  for select using (bucket_id = 'fault-photos');

create policy "fault-photos: authenticated upload" on storage.objects
  for insert with check (bucket_id = 'fault-photos' and auth.uid() is not null);

-- Realtime: equipment list/detail and the queue/requests screens subscribe
-- to postgres_changes on these two tables instead of polling or requiring a
-- manual refresh button.
alter publication supabase_realtime add table equipment;
alter publication supabase_realtime add table faults;
