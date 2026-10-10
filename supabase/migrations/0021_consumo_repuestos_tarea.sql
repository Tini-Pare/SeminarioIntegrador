-- =====================================================================
-- Consumo de repuestos al finalizar una tarea
--
-- repuesto_para_tarea ya existia desde 0002/0003 pero estaba sin usar:
-- RLS admin-only heredada del loop generico de 0003 ("tablas sin UI
-- todavia"), sin check de cantidad, y ningun codigo de la app la tocaba
-- (ver comentario de spareParts.ts: "Nothing consumes stock yet").
--
-- Esta migracion la activa: el tecnico registra que repuestos uso al
-- finalizar su tarea, y esa cantidad se resta de repuestos.rep_cantidad_actual
-- en la misma transaccion que marca la tarea como finalizada — si el stock
-- no alcanza, ninguna de las dos cosas se guarda (se apoya en
-- repuestos_stock_no_negativo_chk, ya existente desde 0010, exactamente
-- igual que anular_remito_compra hace con las devoluciones de stock).
-- =====================================================================

alter table repuesto_para_tarea alter column repta_canti_usada set not null;

alter table repuesto_para_tarea drop constraint if exists repuesto_para_tarea_cantidad_chk;
alter table repuesto_para_tarea add constraint repuesto_para_tarea_cantidad_chk
  check (repta_canti_usada > 0);

drop policy if exists "repuesto_para_tarea: admin only" on repuesto_para_tarea;

-- El admin sigue viendo/gestionando todo (por ejemplo, para corregir un
-- registro cargado mal). Los inserts reales de un tecnico pasan por
-- finalizar_tarea (security definer, mas abajo), no por esta policy.
create policy "repuesto_para_tarea: admin all" on repuesto_para_tarea
  for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

-- El tecnico puede leer que repuestos registro en sus propias tareas
-- (detalle de OT, historial de la tarea), pero no puede insertar ni
-- editar directo desde el cliente.
create policy "repuesto_para_tarea: read own tarea" on repuesto_para_tarea
  for select using (
    exists (
      select 1 from tareas_realizadas_orden t
      where t.taro_id_tarea_orden = repuesto_para_tarea.taro_id_tarea_orden
        and t.p_id_tecnico = auth.uid()
    )
  );

-- =====================================================================
-- finalizar_tarea — reemplaza el update directo que hacia finishTask
-- (taro_fecha_fin = hoy) por una transaccion que ademas registra el
-- consumo de repuestos y resta stock. p_repuestos: jsonb array de
-- {"rep_id": int, "cantidad": int}, o null/[] si no se uso ninguno.
--
-- security definer porque, a diferencia de startTask/finishTask (que son
-- un simple update bajo la policy "tecnico actualiza su propia tarea",
-- 0018), esto necesita tocar repuesto_para_tarea (RLS de solo admin para
-- escritura) y repuestos (RLS de solo admin para update) en la misma
-- transaccion — RLS sola no puede expresar "solo tu propia tarea, y solo
-- si hay stock suficiente" cruzando tres tablas.
-- =====================================================================
create or replace function finalizar_tarea(
  p_taro_id_tarea_orden int,
  p_repuestos           jsonb default null
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
    set taro_fecha_fin = current_date
    where taro_id_tarea_orden = p_taro_id_tarea_orden;
end;
$$;

grant execute on function finalizar_tarea(int, jsonb) to authenticated;
