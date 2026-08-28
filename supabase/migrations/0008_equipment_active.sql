-- Equipment is taken out of the inventory without removing its history or
-- related requests and work orders.
alter table equipo
  add column if not exists eq_activo boolean not null default true;
