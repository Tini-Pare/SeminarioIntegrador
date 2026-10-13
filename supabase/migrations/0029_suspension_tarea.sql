-- =====================================================================
-- SCRUM-37: the técnico marks a tarea as suspended, with a reason
--
-- "Como técnico quiero marcar una tarea como suspendida con motivo para
-- dejar registro de trabajos demorados". A tarea already started can be
-- put on hold (missing repuestos, waiting for an external provider, ...)
-- and resumed later. While suspended it can't be finished.
--
-- The current suspension lives on the tarea itself (since when, reason,
-- optional comment); every suspend/resume is also written to the equipo's
-- historial by the app, so past suspensions stay on record after resuming.
--
-- Suspending/resuming is a plain update under the existing "técnico
-- updates own tarea" policy (0018), same as starting one. The check
-- constraints below are what keep the data consistent whatever the
-- client sends.
--
-- ot_estado is NOT affected: a suspended tarea is still started and not
-- finished, so its OT stays 'in_progress' (sync_orden_estado, 0017).
-- =====================================================================

alter table tareas_realizadas_orden
  add column if not exists taro_fecha_suspension      date,
  add column if not exists taro_motivo_suspension     varchar(100),
  add column if not exists taro_comentario_suspension varchar(255);

-- Only a tarea in progress (started, not finished) can be suspended.
alter table tareas_realizadas_orden
  drop constraint if exists tareas_realizadas_orden_suspension_en_curso_chk;
alter table tareas_realizadas_orden
  add constraint tareas_realizadas_orden_suspension_en_curso_chk check (
    taro_fecha_suspension is null
    or (taro_fecha_inicio is not null and taro_fecha_fin is null)
  );

-- Date and reason go together; a comment only exists on a suspension.
alter table tareas_realizadas_orden
  drop constraint if exists tareas_realizadas_orden_suspension_motivo_chk;
alter table tareas_realizadas_orden
  add constraint tareas_realizadas_orden_suspension_motivo_chk check (
    (taro_fecha_suspension is null and taro_motivo_suspension is null
      and taro_comentario_suspension is null)
    or (taro_fecha_suspension is not null and taro_motivo_suspension is not null)
  );

-- =====================================================================
-- finalizar_tarea — same as 0023, plus: a suspended tarea must be resumed
-- before finishing it (the constraint above would reject the update
-- anyway, but with a cryptic message).
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
  v_p_id_tecnico      uuid;
  v_taro_fecha_inicio date;
  v_taro_fecha_fin    date;
  v_taro_fecha_susp   date;
  v_linea             jsonb;
  v_rep_id            int;
  v_cantidad          int;
  v_diagnostico       text := nullif(btrim(p_diagnostico), '');
begin
  select p_id_tecnico, taro_fecha_inicio, taro_fecha_fin, taro_fecha_suspension
    into v_p_id_tecnico, v_taro_fecha_inicio, v_taro_fecha_fin, v_taro_fecha_susp
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

  if v_taro_fecha_susp is not null then
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
