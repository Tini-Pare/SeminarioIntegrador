-- =====================================================================
-- When OTs are created, and when preventive ones are emitted
--
-- 1. ot_creada_en: the moment an OT was created. ot_fecha_inicio is a
--    bare date, so anything showing "how long ago" an OT came up (the
--    admin's preventive notifications, 0038) read it as UTC midnight —
--    21:00 of the day before in Argentina.
--
-- 2. pm_hora_emision: the hour (Argentina time, 0–23) at which a plan's
--    preventive OTs are emitted on each equipo's due date. An equipo due
--    on day D gets its OT once D at that hour has passed; one already
--    overdue from an earlier day (no técnicos back then, plan inactive,
--    a missed run) gets it right away. That same rule applies when the
--    admin saves a plan, so a plan saved before its hour waits for it.
--    Existing plans keep 06:00, the hour the daily job ran at so far.
--
-- 3. The pg_cron job now runs every hour, on the hour, instead of daily.
--
-- Dates in generar_ots_preventivas are now Argentina's: the database runs
-- in UTC, so from 21:00 on current_date is already tomorrow there.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ot_creada_en
-- ---------------------------------------------------------------------
alter table orden_de_trabajo
  add column if not exists ot_creada_en timestamptz;

-- Existing rows: their generation event in historial is the closest real
-- time; otherwise noon of their start date, so they never shift a day.
update orden_de_trabajo o
  set ot_creada_en = coalesce(
    (select min(h.hi_fecha_hora)
       from historial h
       where h.eq_id_equipo = o.eq_id_equipo
         and h.hi_tipo = 'Asignada'
         and h.hi_fecha_hora::date = o.ot_fecha_inicio),
    (o.ot_fecha_inicio + time '12:00') at time zone 'America/Argentina/Buenos_Aires'
  )
  where o.ot_creada_en is null;

alter table orden_de_trabajo
  alter column ot_creada_en set default now(),
  alter column ot_creada_en set not null;

-- ---------------------------------------------------------------------
-- 2. pm_hora_emision
-- ---------------------------------------------------------------------
alter table plan_mantenimiento
  add column if not exists pm_hora_emision smallint not null default 6;

alter table plan_mantenimiento
  drop constraint if exists plan_mantenimiento_pm_hora_emision_check;

alter table plan_mantenimiento
  add constraint plan_mantenimiento_pm_hora_emision_check
  check (pm_hora_emision between 0 and 23);

-- ---------------------------------------------------------------------
-- 3. crear/editar_plan_mantenimiento take p_hora_emision. Same bodies as
-- 0038 otherwise. The old signatures are dropped first: with a new
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
  p_hora_emision int default 6
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
    pm_estado,
    pm_hora_emision
  ) values (
    p_te_id,
    trim(p_nombre),
    nullif(trim(p_descripcion), ''),
    p_frecuencia,
    coalesce(p_estado, 'activo'),
    p_hora_emision
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
  p_hora_emision int default 6
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

grant execute on function crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int) to authenticated;
grant execute on function editar_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int) to authenticated;

-- ---------------------------------------------------------------------
-- 4. generar_ots_preventivas honours pm_hora_emision. Same as 0037
-- otherwise (one técnico per tarea).
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
    select p.pm_id_plan, p.pm_nombre_plan, me.eq_id_equipo
      from plan_mantenimiento p
      join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
      join equipo e on e.eq_id_equipo = me.eq_id_equipo
      where p.pm_estado = 'activo'
        and (p_pm_id is null or p.pm_id_plan = p_pm_id)
        and e.eq_estado_registro = 'activo'
        and not e.eq_pendiente_instalacion
        -- No known last maintenance: due today.
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
      ot_fecha_inicio
    ) values (
      r.eq_id_equipo, r.pm_id_plan, 'preventivo', 'medium',
      format('Mantenimiento preventivo del plan "%s".', r.pm_nombre_plan),
      v_hoy
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
-- 5. Hourly run with pg_cron, on the hour. If the extension can't be
-- created here, enable it from Supabase (Database > Extensions > pg_cron)
-- and run just this block again.
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  -- Scheduling under an existing name replaces that job (the daily one
  -- from 0035).
  perform cron.schedule(
    'generar-ots-preventivas',
    '0 * * * *',
    'select public.generar_ots_preventivas()'
  );
exception when others then
  raise notice 'No se pudo programar la generación horaria con pg_cron (%). Habilitá la extensión y volvé a correr este bloque.', sqlerrm;
end;
$$;
