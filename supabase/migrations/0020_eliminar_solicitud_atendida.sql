-- sol_atendida (0019) turned out to be redundant: a solicitud is already
-- "atendida" whenever sol_estado is anything other than 'pendiente' (the
-- app's "new" status). Drops it; sol_motivo_rechazo, sol_comentario_rechazo
-- and the 'rechazada' status stay, they carry information atendida didn't.

alter table solicitudes drop column if exists sol_atendida;
