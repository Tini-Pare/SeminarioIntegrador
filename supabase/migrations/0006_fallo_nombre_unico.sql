-- Prevents duplicate fault-type names in the catalog. Case-insensitive and
-- trim-insensitive so "Pérdida de gas", "perdida de gas " (sic) and
-- "PÉRDIDA DE GAS" all collide. The app also checks client-side for a
-- friendly message; this index is the backstop and maps to SQLSTATE 23505,
-- which the query layer turns into "Ya existe una falla genérica con ese nombre".

create unique index fallo_nombre_unico_idx on fallo (lower(btrim(fa_nombre)));
