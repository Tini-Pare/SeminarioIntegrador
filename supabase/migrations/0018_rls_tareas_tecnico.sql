-- Fixes a real bug: 0003's "tables with no UI yet" loop gave admin-only RLS
-- to tareas_realizadas_orden, tareas_generales and fallo_por_orden — true
-- at the time, but 0017 put tareas_realizadas_orden in daily use by
-- técnicos (listMyTasks/startTask/finishTask), and both it and its
-- embedded tareas_generales/fallo_por_orden are read by every role via the
-- solicitud queries (listMyRequests, listMyTasks, etc.). Under admin-only
-- RLS those reads silently come back empty instead of erroring — which is
-- exactly why a técnico's "Cola de trabajo" showed no tareas even though
-- rows existed: the SELECT never reached them.

-- ---------------------------------------------------------------------
-- tareas_generales: catalog read broadens to any authenticated (same
-- pattern as lugares/tipos_de_equipos/equipo in 0001/0003); admin keeps
-- exclusive write, unchanged from before.
-- ---------------------------------------------------------------------
drop policy if exists "tareas_generales: admin only" on tareas_generales;

create policy "tareas_generales: any authenticated read" on tareas_generales
  for select using (auth.uid() is not null);
create policy "tareas_generales: admin inserts" on tareas_generales
  for insert with check (current_role_name() = 'admin');
create policy "tareas_generales: admin updates" on tareas_generales
  for update using (current_role_name() = 'admin');
create policy "tareas_generales: admin deletes" on tareas_generales
  for delete using (current_role_name() = 'admin');

-- ---------------------------------------------------------------------
-- fallo_por_orden: same story — read broadens, writes (only ever done by
-- generateOrder/addTaskToOrder, both admin actions) stay admin-only.
-- ---------------------------------------------------------------------
drop policy if exists "fallo_por_orden: admin only" on fallo_por_orden;

create policy "fallo_por_orden: any authenticated read" on fallo_por_orden
  for select using (auth.uid() is not null);
create policy "fallo_por_orden: admin inserts" on fallo_por_orden
  for insert with check (current_role_name() = 'admin');
create policy "fallo_por_orden: admin updates" on fallo_por_orden
  for update using (current_role_name() = 'admin');
create policy "fallo_por_orden: admin deletes" on fallo_por_orden
  for delete using (current_role_name() = 'admin');

-- ---------------------------------------------------------------------
-- tareas_realizadas_orden: admin/técnico read (mirrors orden_de_trabajo's
-- own policy), plus the reporting user via their solicitud. generateOrder/
-- addTaskToOrder/reassignTaskTechnician stay admin-only inserts. Updates
-- split: admin can reassign (change p_id_tecnico), and the assigned
-- técnico can update their OWN row (startTask/finishTask set
-- taro_fecha_inicio/fin) — but nobody else's.
-- ---------------------------------------------------------------------
drop policy if exists "tareas_realizadas_orden: admin only" on tareas_realizadas_orden;

create policy "tareas_realizadas_orden: read admin/technician or own solicitud"
  on tareas_realizadas_orden
  for select using (
    current_role_name() in ('admin', 'technician')
    or exists (
      select 1
      from orden_de_trabajo o
      join solicitudes s on s.sol_id_solicitud = o.sol_id_solicitud
      where o.ot_id_orden = tareas_realizadas_orden.ot_id_orden
        and s.p_legajo_solicitante = auth.uid()
    )
  );
create policy "tareas_realizadas_orden: admin inserts" on tareas_realizadas_orden
  for insert with check (current_role_name() = 'admin');
create policy "tareas_realizadas_orden: admin updates any, técnico updates own"
  on tareas_realizadas_orden
  for update using (
    current_role_name() = 'admin' or p_id_tecnico = auth.uid()
  );
create policy "tareas_realizadas_orden: admin deletes" on tareas_realizadas_orden
  for delete using (current_role_name() = 'admin');
