-- =====================================================================
-- Keep a tarea's last suspension after it's resumed (cátedra feedback:
-- "guardar la última suspensión de una tarea")
--
-- 0029's taro_*_suspension columns were cleared on resume, so the OT
-- detail and the técnico's queue lost why a tarea had been on hold. Now
-- resuming leaves them alone and only sets taro_fecha_fin_suspension:
--
--   fecha_suspension null                      -> never suspended
--   fecha_suspension set, fin_suspension null  -> suspended right now
--   fecha_suspension set, fin_suspension set   -> resumed; this was its
--                                                 last suspension
--
-- Suspending again overwrites the three 0029 columns and clears the end
-- date, so only the last suspension is kept (every one of them also
-- stays in the equipo's historial).
--
-- Since "suspended" no longer means just "fecha_suspension is not null",
-- 0029's in-progress check and finalizar_tarea's guard are redone below.
-- =====================================================================

alter table tareas_realizadas_orden
  add column if not exists taro_fecha_fin_suspension date;

-- An earlier draft of this migration kept the last suspension in four
-- separate columns; drop them in case that draft was already run.
alter table tareas_realizadas_orden
  drop constraint if exists tareas_realizadas_orden_ultima_susp_chk;
alter table tareas_realizadas_orden
  drop column if exists taro_ultima_susp_desde,
  drop column if exists taro_ultima_susp_hasta,
  drop column if exists taro_ultima_susp_motivo,
  drop column if exists taro_ultima_susp_comentario;

-- Only a tarea in progress (started, not finished) can be suspended right
-- now. A resumed one keeps its last suspension even once it's finished.
alter table tareas_realizadas_orden
  drop constraint if exists tareas_realizadas_orden_suspension_en_curso_chk;
alter table tareas_realizadas_orden
  add constraint tareas_realizadas_orden_suspension_en_curso_chk check (
    taro_fecha_suspension is null
    or taro_fecha_fin_suspension is not null
    or (taro_fecha_inicio is not null and taro_fecha_fin is null)
  );

-- The end date only exists on a suspension, and can't come before it.
-- (0029's motivo check — date and reason together — still holds as is.)
alter table tareas_realizadas_orden
  drop constraint if exists tareas_realizadas_orden_fin_suspension_chk;
alter table tareas_realizadas_orden
  add constraint tareas_realizadas_orden_fin_suspension_chk check (
    taro_fecha_fin_suspension is null
    or (taro_fecha_suspension is not null
      and taro_fecha_fin_suspension >= taro_fecha_suspension)
  );

-- =====================================================================
-- finalizar_tarea — same as 0029, except a tarea counts as suspended only
-- while its suspension has no end date.
-- =====================================================================
create or replace function finalizar_tarea(
  p_taro_id_tarea_orden int,
  p_repuestos           jsonb default null,
  p_diagnostico         text  default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_p_id_tecnico        uuid;
  v_taro_fecha_inicio   date;
  v_taro_fecha_fin      date;
  v_taro_fecha_susp     date;
  v_taro_fecha_fin_susp date;
  v_linea               jsonb;
  v_rep_id              int;
  v_cantidad            int;
  v_diagnostico         text := nullif(btrim(p_diagnostico), '');
begin
  select p_id_tecnico, taro_fecha_inicio, taro_fecha_fin, taro_fecha_suspension,
         taro_fecha_fin_suspension
    into v_p_id_tecnico, v_taro_fecha_inicio, v_taro_fecha_fin, v_taro_fecha_susp,
         v_taro_fecha_fin_susp
    from tareas_realizadas_orden
    where taro_id_tarea_orden = p_taro_id_tarea_orden;

  if not found then
    raise exception 'La tarea % no existe', p_taro_id_tarea_orden;
  end if;

  if v_p_id_tecnico is distinct from auth.uid() then
    raise exception 'Solo el técnico asignado puede finalizar esta tarea'
      using errcode = 'insufficient_privilege';
  end if;

  if v_taro_fecha_inicio is null then
    raise exception 'Iniciá la tarea antes de finalizarla';
  end if;

  if v_taro_fecha_fin is not null then
    raise exception 'Esta tarea ya está finalizada';
  end if;

  if v_taro_fecha_susp is not null and v_taro_fecha_fin_susp is null then
    raise exception 'La tarea está suspendida: reanudala antes de finalizarla';
  end if;

  if char_length(v_diagnostico) > 500 then
    raise exception 'El diagnóstico no puede superar los 500 caracteres';
  end if;

  if p_repuestos is not null then
    for v_linea in select * from jsonb_array_elements(p_repuestos)
    loop
      v_rep_id := (v_linea ->> 'rep_id')::int;
      v_cantidad := (v_linea ->> 'cantidad')::int;

      if v_cantidad is null or v_cantidad <= 0 then
        raise exception 'La cantidad de cada repuesto usado debe ser mayor a cero';
      end if;

      insert into repuesto_para_tarea (taro_id_tarea_orden, rep_id, repta_canti_usada)
      values (p_taro_id_tarea_orden, v_rep_id, v_cantidad);

      update repuestos
        set rep_cantidad_actual = rep_cantidad_actual - v_cantidad
        where rep_id = v_rep_id;

      if not found then
        raise exception 'El repuesto % no existe', v_rep_id;
      end if;
    end loop;
  end if;

  update tareas_realizadas_orden
    set taro_fecha_fin = current_date,
        taro_diagnostico = v_diagnostico
    where taro_id_tarea_orden = p_taro_id_tarea_orden;
end;
$$;

grant execute on function finalizar_tarea(int, jsonb, text) to authenticated;
