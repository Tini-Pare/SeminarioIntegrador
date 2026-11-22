-- =====================================================================
-- Fixes from the QA pass of 2026-10-26
--
-- (0042/0043 were applied and then removed from the folder: this one is
-- 0044 so their numbers aren't reused.)
--
-- 1. The database ran in UTC, so from 21:00 in Argentina every
--    current_date (OT start/end, a tarea's end in finalizar_tarea, a
--    pedido's date, …) was already tomorrow. Setting the database time
--    zone fixes all of them at once. Stored timestamptz values don't
--    change, and pg_cron keeps scheduling in UTC (cron.timezone), so the
--    jobs from 0039/0041 still run when they did.
--    Takes effect for new connections: if dates still look off right
--    after running this, restart the project from the Supabase dashboard.
-- 2. Técnicos could insert and update any orden_de_trabajo (0003's
--    policies). Their own flows never write an OT directly —
--    sync_orden_estado (0017), finalizar_tarea (0032) and the preventive
--    generation are security definer — so only the admin keeps them.
--    And a técnico updating their own tarea can no longer hand it to
--    someone else.
-- 3. Equipment codes were unique only as typed: "QA-001" and "qa-001"
--    could coexist. Now unique ignoring case and surrounding spaces.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Argentina's time zone
-- ---------------------------------------------------------------------
alter database postgres set timezone to 'America/Argentina/Buenos_Aires';

-- OTs whose start date came from the UTC default: it equals the UTC date
-- they were created on (ot_creada_en, 0039) but not Argentina's. Task and
-- OT end dates and pedidos have no timestamp to tell, so they stay.
update orden_de_trabajo
  set ot_fecha_inicio = (ot_creada_en at time zone 'America/Argentina/Buenos_Aires')::date
  where ot_fecha_inicio = (ot_creada_en at time zone 'UTC')::date
    and ot_fecha_inicio <> (ot_creada_en at time zone 'America/Argentina/Buenos_Aires')::date;

-- ---------------------------------------------------------------------
-- 2. Only the admin writes OTs; a técnico's tarea stays theirs
-- ---------------------------------------------------------------------
drop policy if exists "orden_de_trabajo: technician/admin insert" on orden_de_trabajo;
drop policy if exists "orden_de_trabajo: admin inserts" on orden_de_trabajo;
create policy "orden_de_trabajo: admin inserts" on orden_de_trabajo
  for insert with check (current_role_name() = 'admin');

drop policy if exists "orden_de_trabajo: technician/admin update" on orden_de_trabajo;
drop policy if exists "orden_de_trabajo: admin updates" on orden_de_trabajo;
create policy "orden_de_trabajo: admin updates" on orden_de_trabajo
  for update using (current_role_name() = 'admin');

drop policy if exists "tareas_realizadas_orden: admin updates any, técnico updates own"
  on tareas_realizadas_orden;
create policy "tareas_realizadas_orden: admin updates any, técnico updates own"
  on tareas_realizadas_orden
  for update
  using (current_role_name() = 'admin' or p_id_tecnico = auth.uid())
  with check (current_role_name() = 'admin' or p_id_tecnico = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Equipment code unique ignoring case and spaces
-- ---------------------------------------------------------------------
do $$
declare
  v_dups text;
begin
  select string_agg(codes, '; ')
    into v_dups
    from (
      select string_agg(eq_codigo, ', ' order by eq_codigo) as codes
        from equipo
        group by lower(btrim(eq_codigo))
        having count(*) > 1
    ) d;

  if v_dups is not null then
    raise exception 'Hay equipos con el mismo código (sin distinguir mayúsculas): %. Cambiá esos códigos y volvé a correr la migración.', v_dups;
  end if;
end;
$$;

create unique index if not exists equipo_eq_codigo_ci_key
  on equipo (lower(btrim(eq_codigo)));
