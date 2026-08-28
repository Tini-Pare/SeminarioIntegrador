-- Repair databases that were created before the logical catalog state was
-- applied. Keep this idempotent so it is safe to run in an existing project.
alter table tareas_generales
  add column if not exists tag_activo boolean not null default true;

alter table fallo
  add column if not exists fa_activo boolean not null default true;
