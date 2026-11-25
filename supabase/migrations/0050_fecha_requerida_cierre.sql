-- =====================================================================
-- Fecha requerida de cierre for every OT
--
-- Sprint 7 correction: what used to be the OT's optional "fecha estimada"
-- (orden_de_trabajo.ot_fecha_estimada_fin, 0018) is now shown as the
-- "fecha requerida de cierre" — the deadline the admin sets — and every OT
-- is created with one. The column keeps its name; only its meaning and the
-- UI wording changed. It stays nullable: OTs created before this have none,
-- and they keep "Sin definir" until the admin defines one.
--
-- The app sets it when an OT is generated from a solicitud
-- (generateOrder). The two OTs created in SQL get theirs here:
--
-- 1. generar_ots_preventivas (0046): a preventive OT is created with
--    fecha requerida de cierre = start + the plan's frequency (days), i.e.
--    it must be done before the next one is due. Same rule statistics used
--    as a fallback (preventiveDeadline), now stored in the OT.
-- 2. alta_equipo (0033): the installation OT of an equipo pending
--    installation takes the date the admin picks in the form
--    (p_fecha_requerida), so it's on equal footing with every other OT.
-- 3. Backfill: preventive OTs created before this without a date get the
--    same start + frequency. OTs whose plan was deleted have no frequency
--    and stay without one.
--
-- Both functions set ot_fecha_inicio to v_hoy (Argentina's date), the same
-- date the deadline checks use. It matches the column default anyway, since
-- the database time zone is Argentina's (0042); written out so start and
-- deadline visibly come from the same day.
--
-- Idempotent: functions create or replace (alta_equipo's old signature is
-- dropped first, so PostgREST never sees two overloads), the backfill only
-- touches OTs that still have no date.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. generar_ots_preventivas — same as 0046, plus ot_fecha_inicio and
--    ot_fecha_estimada_fin on the insert.
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
    select p.pm_id_plan, p.pm_nombre_plan, p.pm_frecuencia, me.eq_id_equipo
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
      -- Due before the next one: start + the plan's frequency in days.
      v_hoy, v_hoy + r.pm_frecuencia
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
-- 2. alta_equipo — same as 0033, plus p_fecha_requerida for the
--    installation OT. The old 9-argument version is dropped so the RPC
--    has a single signature.
-- ---------------------------------------------------------------------
drop function if exists alta_equipo(text, varchar, int, int, varchar, boolean, date, uuid, urgency_t);

create or replace function alta_equipo(
  p_codigo              text,
  p_nombre              varchar,
  p_te_id               int,
  p_lu_codigo           int,
  p_modelo              varchar,
  p_pendiente           boolean,
  p_fecha_instalacion   date      default null, -- installed only
  p_tecnico             uuid      default null, -- pending only
  p_prioridad           urgency_t default null, -- pending only
  p_fecha_requerida     date      default null  -- pending only
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_eq_id    int;
  v_ot_id    int;
  v_tarea_id int;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if current_role_name() is distinct from 'admin' then
    raise exception 'Solo un administrador puede dar de alta equipos';
  end if;

  if p_pendiente then
    if p_tecnico is null then
      raise exception 'Elegí el técnico que va a instalar el equipo';
    end if;
    if not exists (select 1 from profiles where id = p_tecnico and role = 'technician') then
      raise exception 'El técnico elegido no existe';
    end if;
    if p_prioridad is null then
      raise exception 'Elegí la prioridad de la instalación';
    end if;
    if p_fecha_requerida is null then
      raise exception 'Elegí la fecha requerida de cierre de la instalación';
    end if;
    if p_fecha_requerida < v_hoy then
      raise exception 'La fecha requerida de cierre no puede ser anterior a hoy';
    end if;

    select tag_id_tarea into v_tarea_id
      from tareas_generales where tag_codigo_sistema = 'instalacion';
    if v_tarea_id is null then
      raise exception 'Falta la tarea de sistema "Instalación de equipo" (migración 0032)';
    end if;
  else
    if p_fecha_instalacion is null then
      raise exception 'Ingresá la fecha de instalación';
    end if;
    if p_fecha_instalacion > current_date then
      raise exception 'La fecha de instalación no puede ser posterior a hoy';
    end if;
  end if;

  insert into equipo (
    eq_codigo, eq_nombre, te_id, lu_codigo, eq_modelo,
    eq_fecha_instalacion, eq_pendiente_instalacion
  ) values (
    btrim(p_codigo), btrim(p_nombre), p_te_id, p_lu_codigo, nullif(btrim(p_modelo), ''),
    case when p_pendiente then null else p_fecha_instalacion end, p_pendiente
  ) returning eq_id_equipo into v_eq_id;

  if p_pendiente then
    insert into orden_de_trabajo (
      eq_id_equipo, ot_tipo_orden, ot_prioridad, ot_observacion,
      ot_fecha_inicio, ot_fecha_estimada_fin
    ) values (
      v_eq_id, 'instalacion', p_prioridad, 'Instalación y puesta en marcha del equipo nuevo.',
      v_hoy, p_fecha_requerida
    ) returning ot_id_orden into v_ot_id;

    -- sync_orden_estado (0017) runs on this insert and leaves the OT
    -- 'assigned' until the técnico starts the tarea.
    insert into tareas_realizadas_orden (ot_id_orden, tag_id_tarea, p_id_tecnico)
    values (v_ot_id, v_tarea_id, p_tecnico);

    insert into historial (eq_id_equipo, hi_tipo, hi_nota, hi_autor_id)
    values (v_eq_id, 'Asignada', 'Orden de instalación generada para el equipo nuevo.', auth.uid());

    perform sync_equipo_estado(v_eq_id);
  else
    insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
    select pm_id_plan, v_eq_id, p_fecha_instalacion
      from plan_mantenimiento
      where te_id = p_te_id;
  end if;

  return jsonb_build_object('eq_id', v_eq_id, 'ot_id', v_ot_id);
end;
$$;

grant execute on function alta_equipo(
  text, varchar, int, int, varchar, boolean, date, uuid, urgency_t, date
) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Backfill: preventive OTs without a date get start + frequency, the
--    same rule as above. Only the empty ones, so re-running it never
--    overwrites a date the admin rescheduled.
-- ---------------------------------------------------------------------
update orden_de_trabajo o
  set ot_fecha_estimada_fin = o.ot_fecha_inicio + p.pm_frecuencia
  from plan_mantenimiento p
  where o.plan_id_manequipo = p.pm_id_plan
    and o.ot_tipo_orden = 'preventivo'
    and o.ot_fecha_estimada_fin is null;

-- Review (run on its own after the migration): preventive OTs and their
-- new deadline.
-- select o.ot_id_orden, o.ot_estado, o.ot_fecha_inicio, o.ot_fecha_estimada_fin, p.pm_frecuencia
--   from orden_de_trabajo o
--   left join plan_mantenimiento p on p.pm_id_plan = o.plan_id_manequipo
--   where o.ot_tipo_orden = 'preventivo'
--   order by o.ot_id_orden;
