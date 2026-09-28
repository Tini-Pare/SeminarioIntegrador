-- Wires up tareas_realizadas_orden (already in the schema since 0003, but
-- unused): generating an OT no longer assigns ONE técnico to the whole
-- thing — the admin adds tareas genéricas to it, each with its own técnico
-- responsable. orden_de_trabajo.ot_p_id_responsable stops being "the"
-- responsible person (there isn't one anymore) and ot_estado stops being
-- set by hand — both are derived from the OT's tareas.

-- ---------------------------------------------------------------------
-- ot_p_id_responsable: no longer a single responsable, since that now
-- lives per tarea (tareas_realizadas_orden.p_id_tecnico). Kept nullable
-- rather than dropped — old rows keep their value, new ones just don't
-- set it.
-- ---------------------------------------------------------------------
alter table orden_de_trabajo alter column ot_p_id_responsable drop not null;

-- ---------------------------------------------------------------------
-- sync_orden_estado: derives ot_estado from tareas_realizadas_orden —
-- 'assigned' while no tarea has started, 'in_progress' once any tarea has
-- (taro_fecha_inicio set) but not all are done, 'resolved' once every
-- tarea has taro_fecha_fin set. Same shape as sync_equipo_estado (0003),
-- one level up: cascades to solicitudes.sol_estado and to
-- sync_equipo_estado itself when the OT's resolved-ness actually flips.
-- ---------------------------------------------------------------------
create function sync_orden_estado(p_ot_id int) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_prev_estado orden_estado_t;
  v_sol_id int;
  v_eq_id int;
  v_task_count int;
  v_started_count int;
  v_finished_count int;
  v_estado orden_estado_t;
begin
  select ot_estado, sol_id_solicitud, eq_id_equipo
    into v_prev_estado, v_sol_id, v_eq_id
    from orden_de_trabajo where ot_id_orden = p_ot_id;

  if not found then
    return;
  end if;

  select count(*), count(taro_fecha_inicio), count(taro_fecha_fin)
    into v_task_count, v_started_count, v_finished_count
    from tareas_realizadas_orden
    where ot_id_orden = p_ot_id;

  v_estado := case
    when v_task_count > 0 and v_finished_count = v_task_count then 'resolved'
    when v_started_count > 0 then 'in_progress'
    else 'assigned'
  end;

  if v_estado = v_prev_estado then
    return;
  end if;

  update orden_de_trabajo
    set ot_estado = v_estado,
        ot_fecha_fin = case when v_estado = 'resolved' then current_date else null end
    where ot_id_orden = p_ot_id;

  if v_sol_id is not null then
    if v_estado = 'resolved' then
      update solicitudes set sol_estado = 'resuelta' where sol_id_solicitud = v_sol_id;
    elsif v_prev_estado = 'resolved' then
      update solicitudes set sol_estado = 'en_proceso' where sol_id_solicitud = v_sol_id;
    end if;
  end if;

  if v_eq_id is not null then
    perform sync_equipo_estado(v_eq_id);
  end if;
end;
$$;

grant execute on function sync_orden_estado(int) to authenticated;

create function trg_sync_orden_estado() returns trigger
language plpgsql
as $$
begin
  perform sync_orden_estado(coalesce(new.ot_id_orden, old.ot_id_orden));
  return null;
end;
$$;

create trigger tareas_realizadas_orden_sync_orden
  after insert or delete or update of taro_fecha_inicio, taro_fecha_fin
  on tareas_realizadas_orden
  for each row execute function trg_sync_orden_estado();
