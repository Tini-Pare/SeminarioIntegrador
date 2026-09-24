-- =====================================================================
-- Estado de registro (activo/inactivo) para equipo / fallo /
-- tareas_generales, y borrado seguro de equipos.
--
-- Unifica el criterio que ya usa repuestos (rep_estado, migracion 0010):
-- lo que ya tiene historia no se borra, se marca inactivo.
--
-- Dos partes:
--   1. Una columna de estado de registro en cada tabla, con el mismo
--      shape que rep_estado: varchar 'activo'/'inactivo', default
--      'activo', not null, con check.
--   2. Se saca el ON DELETE CASCADE de solicitudes / orden_de_trabajo /
--      historial hacia equipo. Hasta ahora borrar un equipo borraba en
--      silencio todas sus solicitudes, ordenes e historial; a partir de
--      aca tira foreign_key_violation (23503) y la app muestra el mismo
--      mensaje que repuestos.
--
-- eq_estado NO se toca: ese es el estado operativo (operational /
-- waiting / repair) y lo calcula sync_equipo_estado segun las ordenes
-- activas. El estado de registro es otra cosa y se edita a mano, por eso
-- va en una columna aparte (eq_estado_registro).
--
-- Idempotente: columnas con "if not exists", constraints con
-- drop-then-add. Correr en el SQL Editor despues de 0013.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado de registro
-- ---------------------------------------------------------------------
alter table fallo add column if not exists fa_estado varchar(20);
update fallo set fa_estado = 'activo'
  where fa_estado is null or btrim(fa_estado) not in ('activo', 'inactivo');
alter table fallo alter column fa_estado set default 'activo';
alter table fallo alter column fa_estado set not null;
alter table fallo drop constraint if exists fallo_estado_chk;
alter table fallo add constraint fallo_estado_chk
  check (fa_estado in ('activo', 'inactivo'));

alter table tareas_generales add column if not exists tag_estado varchar(20);
update tareas_generales set tag_estado = 'activo'
  where tag_estado is null or btrim(tag_estado) not in ('activo', 'inactivo');
alter table tareas_generales alter column tag_estado set default 'activo';
alter table tareas_generales alter column tag_estado set not null;
alter table tareas_generales drop constraint if exists tareas_generales_estado_chk;
alter table tareas_generales add constraint tareas_generales_estado_chk
  check (tag_estado in ('activo', 'inactivo'));

alter table equipo add column if not exists eq_estado_registro varchar(20);
update equipo set eq_estado_registro = 'activo'
  where eq_estado_registro is null or btrim(eq_estado_registro) not in ('activo', 'inactivo');
alter table equipo alter column eq_estado_registro set default 'activo';
alter table equipo alter column eq_estado_registro set not null;
alter table equipo drop constraint if exists equipo_estado_registro_chk;
alter table equipo add constraint equipo_estado_registro_chk
  check (eq_estado_registro in ('activo', 'inactivo'));

-- ---------------------------------------------------------------------
-- 2. Borrado seguro de equipos
--
-- Las tres FK se crearon inline en 0003, asi que Postgres las nombro
-- <tabla>_eq_id_equipo_fkey. Se recrean identicas pero sin cascade, de
-- modo que el borrado falle en vez de arrastrar la historia del equipo.
-- ---------------------------------------------------------------------
alter table solicitudes drop constraint if exists solicitudes_eq_id_equipo_fkey;
alter table solicitudes add constraint solicitudes_eq_id_equipo_fkey
  foreign key (eq_id_equipo) references equipo(eq_id_equipo);

alter table orden_de_trabajo drop constraint if exists orden_de_trabajo_eq_id_equipo_fkey;
alter table orden_de_trabajo add constraint orden_de_trabajo_eq_id_equipo_fkey
  foreign key (eq_id_equipo) references equipo(eq_id_equipo);

alter table historial drop constraint if exists historial_eq_id_equipo_fkey;
alter table historial add constraint historial_eq_id_equipo_fkey
  foreign key (eq_id_equipo) references equipo(eq_id_equipo);
