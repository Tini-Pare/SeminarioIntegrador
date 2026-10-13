-- =====================================================================
-- SCRUM-35: technicians read the repuestos used on any tarea
--
-- 0021 only let a técnico read repuesto_para_tarea rows of their OWN
-- tareas. The equipment detail's "Historial de fallas" shows every past
-- fault with what was done on it, including the repuestos a colleague
-- used — with the old policy those came back silently empty.
--
-- Read-only: inserts still go exclusively through finalizar_tarea
-- (security definer, 0021), and the admin keeps "repuesto_para_tarea:
-- admin all". Users (role 'user') still can't read this table.
-- =====================================================================

drop policy if exists "repuesto_para_tarea: read own tarea" on repuesto_para_tarea;
drop policy if exists "repuesto_para_tarea: technician reads all" on repuesto_para_tarea;

create policy "repuesto_para_tarea: technician reads all" on repuesto_para_tarea
  for select using (current_role_name() = 'technician');
