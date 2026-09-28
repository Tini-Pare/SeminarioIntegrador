-- Repairs environments where migration 0003 was recorded before the request
-- urgency column was present in the live solicitudes table.
alter table solicitudes
  add column if not exists sol_urgencia urgency_t not null default 'medium';

notify pgrst, 'reload schema';
