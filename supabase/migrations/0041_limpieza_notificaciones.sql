-- =====================================================================
-- Notifications are short-lived: a daily cleanup deletes them
--
-- A notificacion (0040) only matters while it's news, so a pg_cron job
-- deletes, once a day:
--   * read ones, 7 days after they were read;
--   * any, read or not, 30 days after they were created, so forgotten
--     ones don't pile up.
-- What they were about stays: the OT, the repuesto and its movements
-- live in their own tables.
--
-- no_leida_en records when a row was read, so the 7 days count from the
-- reading, not from the creation. A trigger sets it when no_leida turns
-- true; the app still only updates no_leida.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. no_leida_en
-- ---------------------------------------------------------------------
alter table notificacion
  add column if not exists no_leida_en timestamptz;

-- Already read before this migration: when isn't known, so their 7 days
-- start now.
update notificacion
  set no_leida_en = now()
  where no_leida and no_leida_en is null;

create or replace function marcar_notificacion_leida_en() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.no_leida and not old.no_leida then
    new.no_leida_en := now();
  elsif not new.no_leida then
    new.no_leida_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificacion_leida_en on notificacion;
create trigger trg_notificacion_leida_en
  before update of no_leida on notificacion
  for each row execute function marcar_notificacion_leida_en();

create index if not exists notificacion_leida_en_idx
  on notificacion (no_leida_en)
  where no_leida;

create index if not exists notificacion_creada_en_idx
  on notificacion (no_creada_en);

-- ---------------------------------------------------------------------
-- 2. limpiar_notificaciones: the retention rule, in one place.
-- Returns how many rows it deleted.
-- ---------------------------------------------------------------------
create or replace function limpiar_notificaciones() returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from notificacion
    where (no_leida and no_leida_en < now() - interval '7 days')
       or no_creada_en < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only the scheduled job runs it.
revoke execute on function limpiar_notificaciones() from public;

-- ---------------------------------------------------------------------
-- 3. Daily run with pg_cron, at 06:00 UTC (03:00 in Argentina). If the
-- extension can't be created here, enable it from Supabase (Database >
-- Extensions > pg_cron) and run just this block again.
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  -- Scheduling under an existing name replaces that job.
  perform cron.schedule(
    'limpiar-notificaciones',
    '0 6 * * *',
    'select public.limpiar_notificaciones()'
  );
exception when others then
  raise notice 'No se pudo programar la limpieza diaria con pg_cron (%). Habilitá la extensión y volvé a correr este bloque.', sqlerrm;
end;
$$;
