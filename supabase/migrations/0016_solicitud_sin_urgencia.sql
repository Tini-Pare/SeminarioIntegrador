-- Solicitudes stop carrying an urgency picked by the reporting employee —
-- everyone reporting a fault has an incentive to always pick "alta", so it
-- was never a trustworthy signal. Priority now only exists on
-- orden_de_trabajo (ot_prioridad, already there since 0003 with its own
-- 'medium' default): it's decided by whoever evaluates the solicitud and
-- creates the order, the same moment the fallo genérico gets diagnosed
-- (see assignToMe in src/lib/queries/faults.ts, and 0015's header comment
-- for that same reasoning applied to fallo genérico).
alter table solicitudes drop column if exists sol_urgencia;
