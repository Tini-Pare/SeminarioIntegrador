-- Seed the catalog used by the equipment type selector without duplicating
-- values that may already exist in the project.
insert into tipos_de_equipos (te_nombre)
select defaults.name
from (
  values
    ('Aire acondicionado'),
    ('Bomba'),
    ('Compresor'),
    ('Climatizacion'),
    ('Generador electrico'),
    ('Horno industrial'),
    ('Motor'),
    ('Refrigeracion'),
    ('Ventilador industrial')
) as defaults(name)
where not exists (
  select 1
  from tipos_de_equipos existing
  where lower(trim(existing.te_nombre)) = lower(trim(defaults.name))
);

-- Keep the selector synchronized if the catalog is extended later.
alter publication supabase_realtime add table tipos_de_equipos;
