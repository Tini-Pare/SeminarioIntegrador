-- =====================================================================
-- Preventive maintenance alerts (SCRUM-44, SCRUM-45)
--
-- Each plan gets how many days before an equipo's due date the admin
-- wants to be warned (pm_dias_aviso, set on the plan form). The alerts
-- themselves aren't stored: v_alertas_preventivas computes them from
-- mantenimiento_equipo every time it's read, so they can't go stale:
--   * próximo: due within the next pm_dias_aviso days,
--   * vencido: due today or earlier — its preventive OT was already
--     generated (0035) and is still open; ot_id_orden points to it.
-- An alert disappears on its own once that OT is resolved, since
-- trg_ot_preventiva_resuelta moves me_fecha_ult_mant forward.
--
-- Stock-mínimo (SCRUM-43) and critical-fault (SCRUM-59) alerts need no
-- schema change: they're read straight from repuestos and from the
-- técnico's own tareas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. pm_dias_aviso
-- ---------------------------------------------------------------------
alter table plan_mantenimiento
  add column if not exists pm_dias_aviso int not null default 7;

-- Existing plans of a week or less would start with an aviso the RPCs
-- below reject (it must be shorter than the frecuencia).
update plan_mantenimiento
  set pm_dias_aviso = pm_frecuencia - 1
  where pm_dias_aviso >= pm_frecuencia;

alter table plan_mantenimiento
  drop constraint if exists plan_mantenimiento_pm_dias_aviso_check;

alter table plan_mantenimiento
  add constraint plan_mantenimiento_pm_dias_aviso_check check (pm_dias_aviso >= 0);

-- ---------------------------------------------------------------------
-- 2. crear/editar_plan_mantenimiento take p_dias_aviso. Same bodies as
-- 0035 otherwise. The old signatures are dropped first: with a new
-- defaulted parameter, a call naming the old 7 would match both
-- overloads and fail as ambiguous.
-- ---------------------------------------------------------------------
drop function if exists crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb);
drop function if exists editar_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb);

create or replace function crear_plan_mantenimiento(
  p_te_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb, -- ignored since 0035
  p_dias_aviso int default 7
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_pm_id int;
begin
  if current_role_name() is distinct from 'admin' then
    raise exception 'Solo un administrador puede crear planes de mantenimiento';
  end if;

  if p_frecuencia <= 0 or p_frecuencia is null then
    raise exception 'La frecuencia debe ser mayor a 0 días';
  end if;

  -- An aviso as long as the frecuencia would keep the plan alerting
  -- the whole cycle, right after each maintenance.
  if p_dias_aviso is null or p_dias_aviso < 0 or p_dias_aviso >= p_frecuencia then
    raise exception 'El aviso anticipado debe ser de 0 días o más y menor que la frecuencia';
  end if;

  if p_estado = 'activo' and (p_tareas is null or coalesce(array_length(p_tareas, 1), 0) = 0) then
    raise exception 'Un plan activo debe tener al menos una tarea prevista';
  end if;

  if exists (
    select 1 from plan_mantenimiento
    where te_id = p_te_id and lower(trim(pm_nombre_plan)) = lower(trim(p_nombre))
  ) then
    raise exception 'Ya existe un plan con el nombre "%" para este tipo de equipo', trim(p_nombre);
  end if;

  insert into plan_mantenimiento (
    te_id,
    pm_nombre_plan,
    pm_descripcion_plan,
    pm_frecuencia,
    pm_estado,
    pm_dias_aviso
  ) values (
    p_te_id,
    trim(p_nombre),
    nullif(trim(p_descripcion), ''),
    p_frecuencia,
    coalesce(p_estado, 'activo'),
    p_dias_aviso
  ) returning pm_id_plan into v_pm_id;

  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), v_pm_id;
  end if;

  insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
  select v_pm_id, eq_id_equipo, null
    from equipo
    where te_id = p_te_id
      and eq_estado_registro = 'activo'
      and not eq_pendiente_instalacion;

  if coalesce(p_estado, 'activo') = 'activo' then
    perform generar_ots_preventivas(v_pm_id);
  end if;

  return v_pm_id;
end;
$$;

create or replace function editar_plan_mantenimiento(
  p_pm_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb, -- ignored since 0034
  p_dias_aviso int default 7
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_te_id int;
begin
  if current_role_name() is distinct from 'admin' then
    raise exception 'Solo un administrador puede editar planes de mantenimiento';
  end if;

  select te_id into v_te_id from plan_mantenimiento where pm_id_plan = p_pm_id;
  if not found then
    raise exception 'Plan de mantenimiento no encontrado';
  end if;

  if p_frecuencia <= 0 or p_frecuencia is null then
    raise exception 'La frecuencia debe ser mayor a 0 días';
  end if;

  if p_dias_aviso is null or p_dias_aviso < 0 or p_dias_aviso >= p_frecuencia then
    raise exception 'El aviso anticipado debe ser de 0 días o más y menor que la frecuencia';
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
      pm_estado = coalesce(p_estado, 'activo'),
      pm_dias_aviso = p_dias_aviso
  where pm_id_plan = p_pm_id;

  delete from tarea_prevista_plan where pm_id_plan = p_pm_id;
  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), p_pm_id;
  end if;

  if coalesce(p_estado, 'activo') = 'activo' then
    perform generar_ots_preventivas(p_pm_id);
  end if;
end;
$$;

grant execute on function crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int) to authenticated;
grant execute on function editar_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int) to authenticated;

-- ---------------------------------------------------------------------
-- 3. v_planes_mantenimiento — same as 0035 plus pm_dias_aviso (appended
-- last, as create or replace view requires). Now security_invoker: it was
-- running with its owner's rights, bypassing the plan tables' admin-only
-- RLS (flagged by Supabase's "Security Definer View" advisor).
-- ---------------------------------------------------------------------
create or replace view v_planes_mantenimiento
with (security_invoker = true) as
select
  p.pm_id_plan,
  p.te_id,
  t.te_nombre,
  p.pm_nombre_plan,
  p.pm_descripcion_plan,
  p.pm_frecuencia,
  p.pm_estado,
  count(distinct tp.tag_id_tarea)::int as task_count,
  count(distinct me.eq_id_equipo)::int as equipment_count,
  case
    when p.pm_estado = 'inactivo' then null
    when bool_or(me.eq_id_equipo is not null and me.me_fecha_ult_mant is null) then current_date
    else min(me.me_fecha_ult_mant + p.pm_frecuencia)
  end as prox_vencimiento,
  p.pm_dias_aviso
from plan_mantenimiento p
join tipos_de_equipos t on t.te_id = p.te_id
left join tarea_prevista_plan tp on tp.pm_id_plan = p.pm_id_plan
left join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
group by p.pm_id_plan, p.te_id, t.te_nombre, p.pm_nombre_plan, p.pm_descripcion_plan,
  p.pm_frecuencia, p.pm_estado, p.pm_dias_aviso;

grant select on v_planes_mantenimiento to authenticated;

-- ---------------------------------------------------------------------
-- 4. v_alertas_preventivas — one row per equipo of an active plan that is
-- due within its plan's aviso, or already overdue. security_invoker so
-- the plan tables' admin-only RLS (0031/0034) applies to whoever reads it.
-- ---------------------------------------------------------------------
create or replace view v_alertas_preventivas
with (security_invoker = true) as
select
  p.pm_id_plan,
  p.pm_nombre_plan,
  p.pm_frecuencia,
  p.pm_dias_aviso,
  e.eq_id_equipo,
  e.eq_codigo,
  e.eq_nombre,
  me.me_fecha_ult_mant,
  -- No known last maintenance: due today (0035 generates its OT at once).
  coalesce(me.me_fecha_ult_mant + p.pm_frecuencia, current_date) as fecha_vencimiento,
  coalesce(me.me_fecha_ult_mant + p.pm_frecuencia, current_date) - current_date as dias_restantes,
  o.ot_id_orden
from plan_mantenimiento p
join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
join equipo e on e.eq_id_equipo = me.eq_id_equipo
left join lateral (
  select ot.ot_id_orden
    from orden_de_trabajo ot
    where ot.plan_id_manequipo = p.pm_id_plan
      and ot.eq_id_equipo = me.eq_id_equipo
      and ot.ot_tipo_orden = 'preventivo'
      and ot.ot_estado <> 'resolved'
    order by ot.ot_id_orden desc
    limit 1
) o on true
where p.pm_estado = 'activo'
  and e.eq_estado_registro = 'activo'
  and not e.eq_pendiente_instalacion
  and coalesce(me.me_fecha_ult_mant + p.pm_frecuencia, current_date)
      <= current_date + p.pm_dias_aviso;

grant select on v_alertas_preventivas to authenticated;
