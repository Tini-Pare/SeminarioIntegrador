-- Extend the equipment type catalog without inserting duplicate values.
insert into tipos_de_equipos (te_nombre)
select defaults.name
from (
  values
    ('Caldera'),
    ('Equipo de medicion'),
    ('Extractor'),
    ('Maquina herramienta'),
    ('Panel electrico'),
    ('Soldadora'),
    ('Torno'),
    ('Transportador'),
    ('Valvula')
) as defaults(name)
where not exists (
  select 1
  from tipos_de_equipos existing
  where lower(trim(existing.te_nombre)) = lower(trim(defaults.name))
);
