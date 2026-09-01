-- Prevents duplicate general-task names in the catalog. Case-insensitive and
-- trim-insensitive so "Limpieza de filtros", "limpieza de filtros " and
-- "LIMPIEZA DE FILTROS" all collide. The app also checks client-side for a
-- friendly message; this index is the backstop and maps to SQLSTATE 23505,
-- which the query layer turns into "Ya existe una tarea general con ese nombre".

create unique index tareas_generales_nombre_unico_idx
  on tareas_generales (lower(btrim(tag_nombre_tarea)));
