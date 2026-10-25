-- =====================================================================
-- Preventive OTs: one técnico per tarea, not per OT
--
-- 0035 gave every tarea of a new preventive OT to the same técnico (the
-- least loaded one when the OT was generated). The rule is per tarea:
-- each tarea goes to the active técnico with the fewest open tareas at
-- that moment, so an OT's tareas can be spread across several técnicos.
-- tecnico_menos_cargado() is asked again before each insert, and it sees
-- the tareas just inserted, so the load evens out as they're handed out.
-- The admin can still reassign any of them from the OT's detail.
--
-- Same as 0035's generar_ots_preventivas otherwise.
-- =====================================================================

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
begin
  -- pg_cron runs it with no user; from the app only an admin can.
  if auth.uid() is not null and current_role_name() is distinct from 'admin' then
    raise exception 'Solo un administrador puede generar órdenes preventivas';
  end if;

  -- The daily job and an admin saving a plan could run at once; without
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
    insert into orden_de_trabajo (
      eq_id_equipo, plan_id_manequipo, ot_tipo_orden, ot_prioridad, ot_observacion
    ) values (
      r.eq_id_equipo, r.pm_id_plan, 'preventivo', 'medium',
      format('Mantenimiento preventivo del plan "%s".', r.pm_nombre_plan)
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
