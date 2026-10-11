-- =====================================================================
-- Diagnostico del tecnico al finalizar una tarea
--
-- HU (Sprint 5): "Como tecnico quiero registrar diagnosticos de cada tarea
-- realizada para dejar constancia del estado del equipo". El tecnico lo
-- escribe en el mismo modal "Finalizar tarea" donde carga los repuestos
-- usados; es opcional (una tarea de rutina puede no tener nada que
-- anotar), por eso la columna admite null.
--
-- Va en tareas_realizadas_orden y no en orden_de_trabajo.ot_observacion:
-- una OT puede tener varias tareas con distintos tecnicos, y cada uno deja
-- su propio diagnostico de lo que hizo.
-- =====================================================================

alter table tareas_realizadas_orden
  add column if not exists taro_diagnostico varchar(500);

-- finalizar_tarea (0021) gana un tercer parametro. Se borra la version de
-- dos parametros en vez de dejarla como sobrecarga: con p_diagnostico
-- default null, las llamadas viejas (sin diagnostico) siguen resolviendo a
-- esta misma funcion.
drop function if exists finalizar_tarea(int, jsonb);

create or replace function finalizar_tarea(
  p_taro_id_tarea_orden int,
  p_repuestos           jsonb default null,
  p_diagnostico         text  default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_p_id_tecnico    uuid;
  v_taro_fecha_inicio date;
  v_taro_fecha_fin  date;
  v_linea           jsonb;
  v_rep_id          int;
  v_cantidad        int;
  v_diagnostico     text := nullif(btrim(p_diagnostico), '');
begin
  select p_id_tecnico, taro_fecha_inicio, taro_fecha_fin
    into v_p_id_tecnico, v_taro_fecha_inicio, v_taro_fecha_fin
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
