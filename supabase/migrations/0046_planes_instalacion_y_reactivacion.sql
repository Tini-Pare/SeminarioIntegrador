-- =====================================================================
-- Plans take each equipo's installation date and registration state into
-- account
--
-- 1. Joining a new plan: an equipo starts from its installation date.
--      * eq_fecha_instalacion + pm_frecuencia > today: me_fecha_ult_mant is
--        the installation date, and its first OT comes on that due date.
--      * otherwise (or with no known date): me_fecha_ult_mant stays null
--        until its preventive OT is emitted, which sets it to that day.
--    So null now means "OT waiting to be emitted". It isn't set to today
--    right when the plan is created because the OT may come later: an
--    inactive plan, no active técnicos, or the plan's pm_hora_emision (0039)
--    not reached yet. A date would also make the equipo stop being due.
--
-- 2. Reactivating an equipo joins it to the plans of its tipo created while
--    it was inactive. It's taken as back in service, not as due at once, so
--    no OT is generated right away:
--      * in a plan it had no date in, or overdue: the cycle restarts from
--        the reactivation date.
--      * still within its cycle: nothing changes, so deactivating by
--        mistake doesn't cost a real last maintenance date.
--
-- 3. Deactivating an equipo: generar_ots_preventivas already skips it
--    (0035). Its mantenimiento_equipo rows are kept, since they hold its real
--    last maintenance for when it's reactivated, but it no longer counts in
--    v_planes_mantenimiento. OTs already open stay open: orden_estado_t has
--    no cancelled state.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. crear_plan_mantenimiento — same as 0039, except for the date each
-- equipo joins with. least() only guards rows older than the "not after
-- today" validation on the installation date, which would otherwise fail
-- me_fecha_ult_mant's check (0031) and block the whole plan.
-- ---------------------------------------------------------------------
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

grant execute on function crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. generar_ots_preventivas — same as 0039, plus: emitting the OT of an
-- equipo with no date sets it to today. Equipos already on a cycle keep
-- theirs until the OT is resolved (trg_ot_preventiva_resuelta, 0035), so
-- they still read as overdue meanwhile.
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
-- 3. Reactivating an equipo. A trigger, like the rest of the plan upkeep,
-- because the app changes the state with a plain update on equipo. Security
-- definer: the admin has no UPDATE on mantenimiento_equipo (0034).
-- A pending equipo joins its plans on installation instead (0032).
-- ---------------------------------------------------------------------
create or replace function trg_equipo_reactivado() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_planes int;
begin
  -- Every plan of the tipo, inactive ones too, same as finalizar_tarea
  -- (0032). The left join leaves me_fecha_ult_mant null when there's no
  -- row yet, so those fall under the same condition as a row with no date.
  insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
  select p.pm_id_plan, new.eq_id_equipo, current_date
    from plan_mantenimiento p
    left join mantenimiento_equipo me
      on me.pm_id_plan = p.pm_id_plan and me.eq_id_equipo = new.eq_id_equipo
    where p.te_id = new.te_id
      and (me.me_fecha_ult_mant is null
           or me.me_fecha_ult_mant + p.pm_frecuencia <= current_date)
  on conflict (pm_id_plan, eq_id_equipo)
    do update set me_fecha_ult_mant = excluded.me_fecha_ult_mant;
  get diagnostics v_planes = row_count;

  insert into historial (eq_id_equipo, hi_tipo, hi_nota, hi_autor_id)
  values (
    new.eq_id_equipo,
    'Reactivación',
    case
      when v_planes = 0 then format(
        'Equipo reactivado el %s.',
        to_char(current_date, 'DD/MM/YYYY'))
      when v_planes = 1 then format(
        'Equipo reactivado el %s. 1 plan de mantenimiento cuenta su ciclo desde esa fecha.',
        to_char(current_date, 'DD/MM/YYYY'))
      else format(
        'Equipo reactivado el %s. %s planes de mantenimiento cuentan su ciclo desde esa fecha.',
        to_char(current_date, 'DD/MM/YYYY'), v_planes)
    end,
    auth.uid()
  );

  return null;
end;
$$;

drop trigger if exists equipo_reactivado on equipo;
create trigger equipo_reactivado
  after update of eq_estado_registro on equipo
  for each row
  when (old.eq_estado_registro = 'inactivo'
        and new.eq_estado_registro = 'activo'
        and not new.eq_pendiente_instalacion)
  execute function trg_equipo_reactivado();

-- ---------------------------------------------------------------------
-- 4. v_planes_mantenimiento — same as 0038, counting active equipos only.
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
  end as prox_vencimiento
from plan_mantenimiento p
join tipos_de_equipos t on t.te_id = p.te_id
left join tarea_prevista_plan tp on tp.pm_id_plan = p.pm_id_plan
left join (
  mantenimiento_equipo me
  join equipo e on e.eq_id_equipo = me.eq_id_equipo and e.eq_estado_registro = 'activo'
) on me.pm_id_plan = p.pm_id_plan
group by p.pm_id_plan, p.te_id, t.te_nombre, p.pm_nombre_plan, p.pm_descripcion_plan,
  p.pm_frecuencia, p.pm_estado;

grant select on v_planes_mantenimiento to authenticated;

-- ---------------------------------------------------------------------
-- 5. Existing data. OTs already generated are left alone.
-- ---------------------------------------------------------------------

-- No date with its OT already open: the day that OT was emitted.
update mantenimiento_equipo me
  set me_fecha_ult_mant = o.ot_fecha_inicio
  from orden_de_trabajo o
  where me.me_fecha_ult_mant is null
    and o.plan_id_manequipo = me.pm_id_plan
    and o.eq_id_equipo = me.eq_id_equipo
    and o.ot_tipo_orden = 'preventivo'
    and o.ot_estado <> 'resolved';

-- No date and no OT yet (e.g. an inactive plan): the rule from section 1.
update mantenimiento_equipo me
  set me_fecha_ult_mant = least(e.eq_fecha_instalacion, current_date)
  from equipo e, plan_mantenimiento p
  where me.me_fecha_ult_mant is null
    and e.eq_id_equipo = me.eq_id_equipo
    and p.pm_id_plan = me.pm_id_plan
    and e.eq_fecha_instalacion + p.pm_frecuencia > current_date;

-- Active equipos left out of a plan of their tipo (they were inactive when
-- it was created, and reactivated before this trigger existed).
insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
select p.pm_id_plan, e.eq_id_equipo, current_date
  from plan_mantenimiento p
  join equipo e on e.te_id = p.te_id
  where e.eq_estado_registro = 'activo'
    and not e.eq_pendiente_instalacion
on conflict (pm_id_plan, eq_id_equipo) do nothing;
