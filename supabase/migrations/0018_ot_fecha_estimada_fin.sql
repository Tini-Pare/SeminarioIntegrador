-- =====================================================================
-- orden_de_trabajo — fecha estimada de resolucion (HU 8)
--
-- ot_fecha_fin es la fecha REAL de cierre y la escribe sync_orden_estado
-- (0017) cuando todas las tareas quedan finalizadas: nadie la edita a
-- mano. Esta columna nueva es otra cosa — la fecha OBJETIVO que el admin
-- fija al planificar, y puede reprogramar mientras la OT siga abierta.
--
-- Al ser un dato que solo escribe el admin, no toca el calculo automatico
-- del estado ni la fecha real de cierre: conviven sin pisarse. Tenerla
-- permite ademas detectar ordenes atrasadas (hoy > estimada y todavia sin
-- resolver) sin necesidad de estados manuales.
--
-- Nullable a proposito: las ordenes ya cargadas no tienen estimacion, y
-- poner una no puede ser obligatorio retroactivamente.
--
-- Idempotente: columna con "if not exists", constraint con drop-then-add.
-- Correr en el SQL Editor despues de 0017.
-- =====================================================================

alter table orden_de_trabajo add column if not exists ot_fecha_estimada_fin date;

-- Una estimacion anterior al inicio de la orden no tiene sentido; la UI
-- tambien lo valida, esto es el backstop.
alter table orden_de_trabajo drop constraint if exists orden_fecha_estimada_chk;
alter table orden_de_trabajo add constraint orden_fecha_estimada_chk
  check (ot_fecha_estimada_fin is null or ot_fecha_estimada_fin >= ot_fecha_inicio);
