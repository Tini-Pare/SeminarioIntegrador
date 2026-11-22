-- =====================================================================
-- Preventive OTs generated from the plans de mantenimiento
--
-- For every active plan and every equipo in it (mantenimiento_equipo),
-- an OT of type 'preventivo' is generated once it's due:
--     me_fecha_ult_mant + pm_frecuencia <= today
-- or right away when me_fecha_ult_mant is null (no known maintenance).
-- One open preventive OT per plan + equipo at a time: the next one isn't
-- generated until the current one is resolved.
--
-- The OT gets one tarea per tarea prevista of the plan, all assigned to
-- the active técnico with the fewest unfinished tareas (one técnico per
-- OT, so a single person handles the equipo). The admin can reassign them
-- afterwards from the OT screen, like any other tarea.
--
-- When the OT is resolved (all its tareas finished, sync_orden_estado),
-- that equipo's me_fecha_ult_mant becomes the OT's ot_fecha_fin, which
-- starts the next cycle.
--
-- Generation runs:
--   * daily, with pg_cron (section 8),
--   * right away when a plan is created or edited while active.
--
-- A plan is now created with me_fecha_ult_mant = null for every equipo of
-- its tipo (they get a real date when their first preventive OT is
-- resolved), so crear_plan_mantenimiento no longer takes dates. Equipos
-- that join a plan on their alta or installation (0032/0033) still start
-- from their installation date.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nullable columns
-- ---------------------------------------------------------------------
alter table mantenimiento_equipo alter column me_fecha_ult_mant drop not null;

-- Events written by the system itself (the daily generation has no user
-- behind it). The app shows them as "Sistema".
alter table historial alter column hi_autor_id drop not null;

-- ---------------------------------------------------------------------
-- 2. sync_equipo_estado — same as 0003, but preventive OTs don't change
-- the equipo's estado: an equipo due for its routine maintenance is still
-- working, it isn't "En espera" / "En reparación".
-- ---------------------------------------------------------------------
create or replace function sync_equipo_estado(p_eq_id int) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_estado equipment_status_t;
begin
  select case
    when exists (
      select 1 from orden_de_trabajo
      where eq_id_equipo = p_eq_id and ot_estado = 'in_progress'
        and ot_tipo_orden <> 'preventivo'
    ) then 'repair'
    when exists (
      select 1 from orden_de_trabajo
      where eq_id_equipo = p_eq_id and ot_estado = 'assigned'
        and ot_tipo_orden <> 'preventivo'
    ) or exists (
      select 1 from solicitudes s
      where s.eq_id_equipo = p_eq_id
        and s.sol_estado = 'pendiente'
        and not exists (
          select 1 from orden_de_trabajo o where o.sol_id_solicitud = s.sol_id_solicitud
        )
    ) then 'waiting'
    else 'operational'
  end into v_estado;

  update equipo set eq_estado = v_estado where eq_id_equipo = p_eq_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Técnico for a new preventive OT: the active one with the fewest
-- unfinished tareas; ties go by name so it's predictable.
-- ---------------------------------------------------------------------
create or replace function tecnico_menos_cargado() returns uuid
language sql stable
set search_path = public
as $$
  select p.id
    from profiles p
    left join tareas_realizadas_orden t
      on t.p_id_tecnico = p.id and t.taro_fecha_fin is null
    where p.role = 'technician' and p.active
    group by p.id, p.name
    order by count(t.taro_id_tarea_orden), p.name, p.id
    limit 1
$$;

-- ---------------------------------------------------------------------
-- 4. generar_ots_preventivas: generates every due preventive OT (of one
-- plan, or of all of them with null). Safe to run any number of times.
-- Returns how many OTs it created.
-- ---------------------------------------------------------------------
create or replace function generar_ots_preventivas(p_pm_id int default null) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  r         record;
  v_tecnico uuid;
  v_ot_id   int;
  v_count   int := 0;
begin
  -- pg_cron runs it with no user; from the app only an admin can.
  if auth.uid() is not null and current_role_name() is distinct from 'admin' then
    raise exception 'Solo un administrador puede generar órdenes preventivas';
  end if;

  -- The daily job and an admin saving a plan could run at once; without
  -- this both could see no open OT and generate the same one twice.
  perform pg_advisory_xact_lock(hashtext('generar_ots_preventivas'));

  for r in
    select p.pm_id_plan, p.pm_nombre_plan, me.eq_id_equipo
      from plan_mantenimiento p
      join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
      join equipo e on e.eq_id_equipo = me.eq_id_equipo
      where p.pm_estado = 'activo'
        and (p_pm_id is null or p.pm_id_plan = p_pm_id)
        and e.eq_estado_registro = 'activo'
        and not e.eq_pendiente_instalacion
        and (me.me_fecha_ult_mant is null
             or me.me_fecha_ult_mant + p.pm_frecuencia <= current_date)
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
    v_tecnico := tecnico_menos_cargado();
    if v_tecnico is null then
      raise notice 'No hay técnicos activos: no se generaron más órdenes preventivas';
      exit;
    end if;

    insert into orden_de_trabajo (
      eq_id_equipo, plan_id_manequipo, ot_tipo_orden, ot_prioridad, ot_observacion
    ) values (
      r.eq_id_equipo, r.pm_id_plan, 'preventivo', 'medium',
      format('Mantenimiento preventivo del plan "%s".', r.pm_nombre_plan)
    ) returning ot_id_orden into v_ot_id;

    insert into tareas_realizadas_orden (ot_id_orden, tag_id_tarea, p_id_tecnico)
    select v_ot_id, tp.tag_id_tarea, v_tecnico
      from tarea_prevista_plan tp
      join tareas_generales g on g.tag_id_tarea = tp.tag_id_tarea
      where tp.pm_id_plan = r.pm_id_plan and g.tag_estado = 'activo'
      order by g.tag_nombre_tarea;

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
-- 5. Resolving a preventive OT sets the equipo's last maintenance.
-- sync_orden_estado (0017) flips ot_estado to 'resolved' and sets
-- ot_fecha_fin in the same update once every tarea is finished.
-- ---------------------------------------------------------------------
create or replace function trg_ot_preventiva_resuelta() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha  date := coalesce(new.ot_fecha_fin, current_date);
  v_plan   varchar;
  v_freq   int;
begin
  if new.ot_tipo_orden = 'preventivo'
     and new.plan_id_manequipo is not null
     and new.ot_estado = 'resolved'
     and old.ot_estado is distinct from 'resolved' then
    update mantenimiento_equipo
      set me_fecha_ult_mant = v_fecha
      where pm_id_plan = new.plan_id_manequipo and eq_id_equipo = new.eq_id_equipo;

    select pm_nombre_plan, pm_frecuencia into v_plan, v_freq
      from plan_mantenimiento where pm_id_plan = new.plan_id_manequipo;

    insert into historial (eq_id_equipo, hi_tipo, hi_nota, hi_autor_id)
    values (
      new.eq_id_equipo, 'Preventivo',
      format('Mantenimiento preventivo completado (plan "%s"). Próximo vencimiento: %s.',
        v_plan, to_char(v_fecha + v_freq, 'DD/MM/YYYY')),
      auth.uid()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists orden_de_trabajo_preventiva_resuelta on orden_de_trabajo;
create trigger orden_de_trabajo_preventiva_resuelta
  after update of ot_estado on orden_de_trabajo
  for each row execute function trg_ot_preventiva_resuelta();

-- ---------------------------------------------------------------------
-- 6. Plans: created with no dates, and generate their due OTs on save.
-- ---------------------------------------------------------------------

-- crear_plan_mantenimiento — same validations as 0032, but p_equipos is
-- ignored (kept so the signature doesn't change): every installed active
-- equipo of the tipo joins with me_fecha_ult_mant = null.
create or replace function crear_plan_mantenimiento(
  p_te_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb -- ignored since 0035, see above
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
    pm_estado
  ) values (
    p_te_id,
    trim(p_nombre),
    nullif(trim(p_descripcion), ''),
    p_frecuencia,
    coalesce(p_estado, 'activo')
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

-- editar_plan_mantenimiento — same as 0034, plus generating whatever
-- became due (e.g. the plan was reactivated or its frecuencia shortened).
create or replace function editar_plan_mantenimiento(
  p_pm_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb -- ignored since 0034
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

  if coalesce(p_estado, 'activo') = 'activo' then
    perform generar_ots_preventivas(p_pm_id);
  end if;
end;
$$;

grant execute on function crear_plan_mantenimiento to authenticated;
grant execute on function editar_plan_mantenimiento to authenticated;

-- ---------------------------------------------------------------------
-- 7. v_planes_mantenimiento — same as 0031, but an equipo with no last
-- maintenance makes the plan due today (its OT is generated right away).
-- ---------------------------------------------------------------------
create or replace view v_planes_mantenimiento as
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
  end as prox_vencimiento
from plan_mantenimiento p
join tipos_de_equipos t on t.te_id = p.te_id
left join tarea_prevista_plan tp on tp.pm_id_plan = p.pm_id_plan
left join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
group by p.pm_id_plan, p.te_id, t.te_nombre, p.pm_nombre_plan, p.pm_descripcion_plan, p.pm_frecuencia, p.pm_estado;

grant select on v_planes_mantenimiento to authenticated;

-- ---------------------------------------------------------------------
-- 8. Daily run with pg_cron, at 09:00 UTC (06:00 in Argentina). If the
-- extension can't be created here, enable it from Supabase (Database >
-- Extensions > pg_cron) and run just this block again.
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  -- Scheduling under an existing name replaces that job.
  perform cron.schedule(
    'generar-ots-preventivas',
    '0 9 * * *',
    'select public.generar_ots_preventivas()'
  );
exception when others then
  raise notice 'No se pudo programar la generación diaria con pg_cron (%). Habilitá la extensión y volvé a correr este bloque.', sqlerrm;
end;
$$;
