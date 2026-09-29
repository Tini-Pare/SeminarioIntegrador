-- Adds 'rechazada' to solicitud_estado_t and adds sol_atendida,
-- sol_motivo_rechazo and sol_comentario_rechazo to solicitudes.

-- ---------------------------------------------------------------------
-- Extend solicitud_estado_t enum
-- ---------------------------------------------------------------------
alter type solicitud_estado_t add value if not exists 'rechazada';

-- ---------------------------------------------------------------------
-- Add atendida and rejection fields to solicitudes
-- ---------------------------------------------------------------------
alter table solicitudes add column if not exists sol_atendida boolean not null default false;
alter table solicitudes add column if not exists sol_motivo_rechazo text;
alter table solicitudes add column if not exists sol_comentario_rechazo text;

-- ---------------------------------------------------------------------
-- Backfill existing rows: any solicitud that was already processed
-- (in_progress, resuelta, rechazada) is marked as atendida.
-- ---------------------------------------------------------------------
update solicitudes
set sol_atendida = true
where sol_estado in ('en_proceso', 'resuelta', 'rechazada');
