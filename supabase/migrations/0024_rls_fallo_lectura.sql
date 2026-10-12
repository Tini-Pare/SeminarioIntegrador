-- =====================================================================
-- Lectura del catalogo de fallas para cualquier usuario autenticado
--
-- Same bug 0018 fixed for tareas_generales/fallo_por_orden: 0003's "tables
-- with no UI yet" loop left fallo admin-only. 0018 opened fallo_por_orden
-- for reading, but the fallo it points to stayed hidden, so a técnico's
-- listMyTasks embed (fallo_por_orden(fallo(*))) came back with
-- fallo = null and the "Cola de trabajo" crashed with "Cannot read
-- properties of null (reading 'fa_nombre')" as soon as one of their tareas
-- belonged to an OT with a falla genérica. The técnico should see which
-- falla it is ("Falla: ..." on the card), so read broadens to any
-- authenticated (same pattern as tareas_generales in 0018); writes stay
-- admin-only (the Fallas screen is admin's).
-- =====================================================================

drop policy if exists "fallo: admin only" on fallo;

create policy "fallo: any authenticated read" on fallo
  for select using (auth.uid() is not null);
create policy "fallo: admin inserts" on fallo
  for insert with check (current_role_name() = 'admin');
create policy "fallo: admin updates" on fallo
  for update using (current_role_name() = 'admin');
create policy "fallo: admin deletes" on fallo
  for delete using (current_role_name() = 'admin');
