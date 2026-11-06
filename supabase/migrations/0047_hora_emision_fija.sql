-- =====================================================================
-- Preventive OTs are always emitted at 08:00
--
-- The hour is no longer chosen per plan: the app always sends 8 when it
-- creates or edits a plan. This moves existing plans to that hour too, so
-- none keeps emitting at the one it was saved with.
--
-- pm_hora_emision and generar_ots_preventivas stay as they are (0039, 0046):
-- the hourly job still compares each due date against the plan's hour.
--
-- An equipo already due today on a plan that had a later hour gets its OT on
-- the job's next run instead of waiting for that hour. OTs already generated
-- are left alone.
-- =====================================================================
alter table plan_mantenimiento
  alter column pm_hora_emision set default 8;

update plan_mantenimiento
  set pm_hora_emision = 8
  where pm_hora_emision <> 8;
