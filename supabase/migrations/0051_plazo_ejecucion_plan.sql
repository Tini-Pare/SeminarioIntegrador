-- =====================================================================
-- Plazo de ejecución of a maintenance plan
--
-- 0050 gave preventive OTs a fecha requerida de cierre of start + the
-- plan's frequency. That conflates two things: the frequency says how often
-- an OT is emitted, not how long the técnicos have to do it. With a yearly
-- plan the OT only counted as late after a whole year, so it never showed up
-- as overdue and plan compliance was always close to 100%.
--
-- Each plan now has its own plazo (pm_plazo_dias): the days its preventive
-- OTs have to be closed in. fecha requerida de cierre = start + plazo.
-- It's at most the frequency: more time than there is until the next one is
-- due makes no sense (and generar_ots_preventivas never emits a new OT while
-- the previous one is open anyway).
--
-- 1. plan_mantenimiento.pm_plazo_dias, required, 1..pm_frecuencia. Existing
--    plans take their frequency, i.e. exactly the deadline 0050 gave them.
-- 2. crear_plan_mantenimiento / editar_plan_mantenimiento take p_plazo
--    (old signatures dropped, so PostgREST never sees two overloads).
-- 3. generar_ots_preventivas sets ot_fecha_estimada_fin = start + plazo.
-- 4. v_planes_mantenimiento exposes it, for the plan list and statistics.
--
-- OTs already generated keep their date. Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------
alter table plan_mantenimiento add column if not exists pm_plazo_dias int;

update plan_mantenimiento
  set pm_plazo_dias = pm_frecuencia
  where pm_plazo_dias is null;

alter table plan_mantenimiento alter column pm_plazo_dias set not null;

alter table plan_mantenimiento drop constraint if exists plan_plazo_dias_chk;
alter table plan_mantenimiento
  add constraint plan_plazo_dias_chk
  check (pm_plazo_dias > 0 and pm_plazo_dias <= pm_frecuencia);

-- ---------------------------------------------------------------------
-- 2a. crear_plan_mantenimiento — same as 0046, plus p_plazo.
-- ---------------------------------------------------------------------
drop function if exists crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int);

create or replace function crear_plan_mantenimiento(
  p_te_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_plazo int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb, -- ignored since 0035
  p_hora_emision int default 8
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

  if p_plazo is null or p_plazo <= 0 then
    raise exception 'El plazo de ejecución debe ser mayor a 0 días';
  end if;

  if p_plazo > p_frecuencia then
    raise exception 'El plazo de ejecución no puede ser mayor a la frecuencia';
  end if;

  if p_hora_emision is null or p_hora_emision not between 0 and 23 then
    raise exception 'La hora de emisión debe estar entre 0 y 23';
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
    pm_plazo_dias,
    pm_estado,
    pm_hora_emision
  ) values (
    p_te_id,
    trim(p_nombre),
    nullif(trim(p_descripcion), ''),
    p_frecuencia,
    p_plazo,
    coalesce(p_estado, 'activo'),
    p_hora_emision
  ) returning pm_id_plan into v_pm_id;

  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), v_pm_id;
  end if;

  insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
  select v_pm_id, eq_id_equipo,
         case
           when eq_fecha_instalacion + p_frecuencia > current_date
             then least(eq_fecha_instalacion, current_date)
         end
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

grant execute on function crear_plan_mantenimiento(int, varchar, varchar, int, int, varchar, int[], jsonb, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2b. editar_plan_mantenimiento — same as 0039, plus p_plazo. Changing it
--     only affects the OTs generated from now on.
-- ---------------------------------------------------------------------
drop function if exists editar_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int);

create or replace function editar_plan_mantenimiento(
  p_pm_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_plazo int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb, -- ignored since 0034
  p_hora_emision int default 8
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

  if p_plazo is null or p_plazo <= 0 then
    raise exception 'El plazo de ejecución debe ser mayor a 0 días';
  end if;

  if p_plazo > p_frecuencia then
    raise exception 'El plazo de ejecución no puede ser mayor a la frecuencia';
  end if;

  if p_hora_emision is null or p_hora_emision not between 0 and 23 then
    raise exception 'La hora de emisión debe estar entre 0 y 23';
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
      pm_plazo_dias = p_plazo,
      pm_estado = coalesce(p_estado, 'activo'),
      pm_hora_emision = p_hora_emision
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

grant execute on function editar_plan_mantenimiento(int, varchar, varchar, int, int, varchar, int[], jsonb, int) to authenticated;

-- ---------------------------------------------------------------------
-- 3. generar_ots_preventivas — same as 0050, except the deadline is
--    start + the plan's plazo instead of its frequency.
-- ---------------------------------------------------------------------
create or replace function generar_ots_preventivas(p_pm_id int default null) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  r         record;
  t         record;
  v_tecnico uuid;
  v_ot_id   int;
  v_count   int := 0;
  -- Argentina's wall clock, as a plain timestamp to compare against a
  -- due date + the plan's hour.
  v_ahora   timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_hoy     date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  -- pg_cron runs it with no user; from the app only an admin can.
  if auth.uid() is not null and current_role_name() is distinct from 'admin' then
    raise exception 'Solo un administrador puede generar órdenes preventivas';
  end if;

  -- The hourly job and an admin saving a plan could run at once; without
  -- this both could see no open OT and generate the same one twice.
  perform pg_advisory_xact_lock(hashtext('generar_ots_preventivas'));

  -- Checked once up front: with no active técnico nothing can be assigned,
  -- and an OT with no tareas shouldn't be generated.
  if tecnico_menos_cargado() is null then
    raise notice 'No hay técnicos activos: no se generaron órdenes preventivas';
    return 0;
  end if;

  for r in
    select p.pm_id_plan, p.pm_nombre_plan, p.pm_frecuencia, p.pm_plazo_dias, me.eq_id_equipo
      from plan_mantenimiento p
      join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
      join equipo e on e.eq_id_equipo = me.eq_id_equipo
      where p.pm_estado = 'activo'
        and (p_pm_id is null or p.pm_id_plan = p_pm_id)
        and e.eq_estado_registro = 'activo'
        and not e.eq_pendiente_instalacion
        -- No date: its OT is waiting to be emitted, so it's due today.
        and coalesce(me.me_fecha_ult_mant + p.pm_frecuencia, v_hoy)
            + make_interval(hours => p.pm_hora_emision) <= v_ahora
        and exists (
          select 1 from tarea_prevista_plan tp
          join tareas_generales g on g.tag_id_tarea = tp.tag_id_tarea
          where tp.pm_id_plan = p.pm_id_plan and g.tag_estado = 'activo'
        )
        and not exists (
          select 1 from orden_de_trabajo o
          where o.plan_id_manequipo = p.pm_id_plan
            and o.eq_id_equipo = me.eq_id_equipo
            and o.ot_tipo_orden = 'preventivo'
            and o.ot_estado <> 'resolved'
        )
      -- Most overdue first, so if it stops halfway the worst ones are done.
      order by me.me_fecha_ult_mant nulls first, p.pm_id_plan, me.eq_id_equipo
  loop
    insert into orden_de_trabajo (
      eq_id_equipo, plan_id_manequipo, ot_tipo_orden, ot_prioridad, ot_observacion,
      ot_fecha_inicio, ot_fecha_estimada_fin
    ) values (
      r.eq_id_equipo, r.pm_id_plan, 'preventivo', 'medium',
      format('Mantenimiento preventivo del plan "%s".', r.pm_nombre_plan),
      -- The plan's plazo de ejecución, counted from the day it's emitted.
      v_hoy, v_hoy + r.pm_plazo_dias
    ) returning ot_id_orden into v_ot_id;

    for t in
      select tp.tag_id_tarea
        from tarea_prevista_plan tp
        join tareas_generales g on g.tag_id_tarea = tp.tag_id_tarea
        where tp.pm_id_plan = r.pm_id_plan and g.tag_estado = 'activo'
        order by g.tag_nombre_tarea
    loop
      v_tecnico := tecnico_menos_cargado();
      insert into tareas_realizadas_orden (ot_id_orden, tag_id_tarea, p_id_tecnico)
      values (v_ot_id, t.tag_id_tarea, v_tecnico);
    end loop;

    update mantenimiento_equipo
      set me_fecha_ult_mant = v_hoy
      where pm_id_plan = r.pm_id_plan
        and eq_id_equipo = r.eq_id_equipo
        and me_fecha_ult_mant is null;

    insert into historial (eq_id_equipo, hi_tipo, hi_nota, hi_autor_id)
    values (
      r.eq_id_equipo, 'Asignada',
      format('Orden de mantenimiento preventivo generada (plan "%s").', r.pm_nombre_plan),
      auth.uid()
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function generar_ots_preventivas(int) to authenticated;

-- ---------------------------------------------------------------------
-- 4. v_planes_mantenimiento — same as 0046, plus pm_plazo_dias (last, so
--    create or replace can add it).
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
  p.pm_plazo_dias
from plan_mantenimiento p
join tipos_de_equipos t on t.te_id = p.te_id
left join tarea_prevista_plan tp on tp.pm_id_plan = p.pm_id_plan
left join (
  mantenimiento_equipo me
  join equipo e on e.eq_id_equipo = me.eq_id_equipo and e.eq_estado_registro = 'activo'
) on me.pm_id_plan = p.pm_id_plan
group by p.pm_id_plan, p.te_id, t.te_nombre, p.pm_nombre_plan, p.pm_descripcion_plan,
  p.pm_frecuencia, p.pm_estado, p.pm_plazo_dias;

grant select on v_planes_mantenimiento to authenticated;
