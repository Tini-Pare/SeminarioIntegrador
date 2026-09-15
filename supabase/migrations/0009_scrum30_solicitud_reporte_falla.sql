-- Adds database-level guards for the initial fault-reporting flow.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'solicitudes_sol_descripcion_not_blank_chk'
      and conrelid = 'solicitudes'::regclass
  ) then
    alter table solicitudes
      add constraint solicitudes_sol_descripcion_not_blank_chk
      check (length(trim(sol_descripcion)) > 0);
  end if;
end $$;

drop policy if exists "solicitudes: authenticated insert own" on solicitudes;

create policy "solicitudes: active authenticated insert own" on solicitudes
  for insert with check (
    p_legajo_solicitante = auth.uid()
    and exists (
      select 1
      from profiles
      where profiles.id = auth.uid()
        and profiles.active = true
    )
  );
