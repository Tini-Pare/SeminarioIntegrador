-- =====================================================================
-- An equipo's last maintenance date is no longer edited by hand
--
-- mantenimiento_equipo.me_fecha_ult_mant is only set:
--   * when the plan is created (crear_plan_mantenimiento — the admin
--     enters each equipo's real last maintenance once),
--   * when the equipo joins the plan on its alta or its installation
--     (alta_equipo 0033, finalizar_tarea 0032),
--   * and, from then on, by resolving the plan's preventive OTs (to come).
-- Editing a plan can't change it anymore: editar_plan_mantenimiento
-- ignores p_equipos (kept so the signature doesn't change), and the admin
-- loses UPDATE on the table. The functions above are security definer, so
-- they still write it.
-- =====================================================================

create or replace function editar_plan_mantenimiento(
  p_pm_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb -- ignored since 0034, see above
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_te_id int;
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede editar planes de mantenimiento';
  end if;

  select te_id into v_te_id from plan_mantenimiento where pm_id_plan = p_pm_id;
  if not found then
    raise exception 'Plan de mantenimiento no encontrado';
  end if;

  if p_frecuencia <= 0 or p_frecuencia is null then
    raise exception 'La frecuencia debe ser mayor a 0 días';
  end if;

  if p_estado = 'activo' and (p_tareas is null or coalesce(array_length(p_tareas, 1), 0) = 0) then
    raise exception 'Un plan activo debe tener al menos una tarea prevista';
  end if;

  if exists (
    select 1 from plan_mantenimiento
    where te_id = v_te_id
      and pm_id_plan <> p_pm_id
      and lower(trim(pm_nombre_plan)) = lower(trim(p_nombre))
  ) then
    raise exception 'Ya existe otro plan con el nombre "%" para este tipo de equipo', trim(p_nombre);
  end if;

  update plan_mantenimiento
  set pm_nombre_plan = trim(p_nombre),
      pm_descripcion_plan = nullif(trim(p_descripcion), ''),
      pm_frecuencia = p_frecuencia,
      pm_estado = coalesce(p_estado, 'activo')
  where pm_id_plan = p_pm_id;

  delete from tarea_prevista_plan where pm_id_plan = p_pm_id;
  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), p_pm_id;
  end if;
end;
$$;

grant execute on function editar_plan_mantenimiento to authenticated;

-- 0031's single "admin all" policy, split so UPDATE isn't granted.
drop policy if exists "mantenimiento_equipo: admin all" on mantenimiento_equipo;
drop policy if exists "mantenimiento_equipo: admin select" on mantenimiento_equipo;
drop policy if exists "mantenimiento_equipo: admin insert" on mantenimiento_equipo;
drop policy if exists "mantenimiento_equipo: admin delete" on mantenimiento_equipo;

create policy "mantenimiento_equipo: admin select" on mantenimiento_equipo
  for select using (current_role_name() = 'admin');

create policy "mantenimiento_equipo: admin insert" on mantenimiento_equipo
  for insert with check (current_role_name() = 'admin');

create policy "mantenimiento_equipo: admin delete" on mantenimiento_equipo
  for delete using (current_role_name() = 'admin');

revoke update on mantenimiento_equipo from authenticated;
