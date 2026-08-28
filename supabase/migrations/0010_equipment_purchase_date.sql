-- Add the purchase date required by the equipment catalog without changing
-- existing installation or warranty dates.
alter table equipo
  add column if not exists eq_fecha_compra date;
