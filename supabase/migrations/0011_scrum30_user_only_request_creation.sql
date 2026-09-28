-- SCRUM-30 request creation belongs to store staff (`user`). Admins and
-- technicians keep their existing read/update responsibilities, but cannot
-- create a request through a direct Supabase call.
drop policy if exists "solicitudes: active authenticated insert own" on solicitudes;

create policy "solicitudes: active users insert own" on solicitudes
  for insert with check (
    p_legajo_solicitante = auth.uid()
    and current_role_name() = 'user'
    and exists (
      select 1
      from profiles
      where profiles.id = auth.uid()
        and profiles.active = true
    )
  );
