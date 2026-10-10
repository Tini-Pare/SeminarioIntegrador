-- Remove default 'medium' from ot_prioridad on orden_de_trabajo.
-- Priority is mandatory and must always be chosen explicitly by the administrator
-- when generating the work order (SCRUM-24 / UI redesign).
alter table orden_de_trabajo alter column ot_prioridad drop default;
