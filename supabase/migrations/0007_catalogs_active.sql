-- Catalog entries are disabled instead of physically deleted so existing
-- plans, orders and history can continue referring to them.
alter table tareas_generales
  add column if not exists tag_activo boolean not null default true;

alter table fallo
  add column if not exists fa_activo boolean not null default true;

-- Keep admin catalog screens synchronized across sessions.
alter publication supabase_realtime add table tareas_generales;
alter publication supabase_realtime add table fallo;
