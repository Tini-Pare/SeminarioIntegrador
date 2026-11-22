-- =====================================================================
-- One notificacion table for the admin's bell, filled by triggers
--
-- Every notification is a row, written by a trigger the moment its cause
-- happens, one row per active admin (so each admin has their own read
-- state in no_leida). The app only reads rows and marks them read.
--
-- Types:
--   * ot_preventiva — a preventive OT was generated (0035/0037/0039).
--   * stock_bajo    — an active repuesto went from above its mínimo to
--                     at/below it (consumption, or the admin raising the
--                     mínimo).
--   * sin_stock     — an active repuesto went from some stock to none.
--                     Dropping straight from above the mínimo to 0 gives
--                     only this one.
-- Creating a repuesto notifies nothing: it always starts at 0. A purchase
-- that refills it and a later drop notify again — one per crossing, not
-- one per consumption.
--
-- Replaces 0038's notificacion_ot_leida (its read state is carried over)
-- and the preventive notifications being computed straight off
-- orden_de_trabajo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. notificacion
-- ---------------------------------------------------------------------
create table if not exists notificacion (
  no_id        serial primary key,
  -- Recipient.
  user_id      uuid not null references auth.users(id) on delete cascade,
  no_tipo      varchar not null
               check (no_tipo in ('ot_preventiva', 'stock_bajo', 'sin_stock')),
  ot_id_orden  int references orden_de_trabajo(ot_id_orden) on delete cascade,
  rep_id       int references repuestos(rep_id) on delete cascade,
  -- Stock and mínimo when it happened, so a stock notification still reads
  -- right after the repuesto is refilled.
  no_cantidad  int,
  no_minimo    int,
  no_leida     boolean not null default false,
  no_creada_en timestamptz not null default now(),
  constraint notificacion_referencia_check check (
    (no_tipo = 'ot_preventiva' and ot_id_orden is not null)
    or (no_tipo in ('stock_bajo', 'sin_stock') and rep_id is not null)
  )
);

create index if not exists notificacion_user_creada_en_idx
  on notificacion (user_id, no_creada_en desc);

alter table notificacion enable row level security;

-- Each user sees and marks only their own. Rows are written by the
-- triggers alone (security definer), so there are no insert/delete
-- policies, and the only column a user can change is no_leida.
drop policy if exists "notificacion: own select" on notificacion;
create policy "notificacion: own select" on notificacion
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notificacion: own update" on notificacion;
create policy "notificacion: own update" on notificacion
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on notificacion from authenticated;
grant select on notificacion to authenticated;
grant update (no_leida) on notificacion to authenticated;

-- ---------------------------------------------------------------------
-- 2. notificar_admins: one row per active admin
-- ---------------------------------------------------------------------
create or replace function notificar_admins(
  p_tipo     varchar,
  p_ot_id    int default null,
  p_rep_id   int default null,
  p_cantidad int default null,
  p_minimo   int default null
) returns void
language sql security definer
set search_path = public
as $$
  insert into notificacion (user_id, no_tipo, ot_id_orden, rep_id, no_cantidad, no_minimo)
  select p.id, p_tipo, p_ot_id, p_rep_id, p_cantidad, p_minimo
    from profiles p
    where p.role = 'admin' and p.active;
$$;

-- Only the triggers below call it.
revoke execute on function notificar_admins(varchar, int, int, int, int) from public;

-- ---------------------------------------------------------------------
-- 3. Trigger on orden_de_trabajo: a new preventive OT
-- ---------------------------------------------------------------------
create or replace function notificar_ot_preventiva() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform notificar_admins('ot_preventiva', p_ot_id => new.ot_id_orden);
  return new;
end;
$$;

drop trigger if exists trg_notificar_ot_preventiva on orden_de_trabajo;
create trigger trg_notificar_ot_preventiva
  after insert on orden_de_trabajo
  for each row
  when (new.ot_tipo_orden = 'preventivo')
  execute function notificar_ot_preventiva();

-- ---------------------------------------------------------------------
-- 4. Trigger on repuestos: stock crossing its mínimo or running out.
-- security definer: stock is mostly moved by técnicos finishing tareas
-- (finalizar_tarea), who can't write notificaciones.
-- ---------------------------------------------------------------------
create or replace function notificar_stock_minimo() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.rep_estado <> 'activo' then
    return new;
  end if;

  if new.rep_cantidad_actual <= 0 and old.rep_cantidad_actual > 0 then
    perform notificar_admins(
      'sin_stock',
      p_rep_id => new.rep_id,
      p_cantidad => new.rep_cantidad_actual,
      p_minimo => new.rep_stock_minimo
    );
  elsif new.rep_cantidad_actual <= new.rep_stock_minimo
        and old.rep_cantidad_actual > old.rep_stock_minimo then
    perform notificar_admins(
      'stock_bajo',
      p_rep_id => new.rep_id,
      p_cantidad => new.rep_cantidad_actual,
      p_minimo => new.rep_stock_minimo
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_stock_minimo on repuestos;
create trigger trg_notificar_stock_minimo
  after update of rep_cantidad_actual, rep_stock_minimo on repuestos
  for each row execute function notificar_stock_minimo();

-- ---------------------------------------------------------------------
-- 5. Existing preventive OTs become rows, keeping what each admin had
-- already read in 0038's notificacion_ot_leida.
-- ---------------------------------------------------------------------
insert into notificacion (user_id, no_tipo, ot_id_orden, no_leida, no_creada_en)
select
  p.id,
  'ot_preventiva',
  o.ot_id_orden,
  exists (
    select 1 from notificacion_ot_leida l
    where l.user_id = p.id and l.ot_id_orden = o.ot_id_orden
  ),
  o.ot_creada_en
from orden_de_trabajo o
cross join profiles p
where o.ot_tipo_orden = 'preventivo'
  and p.role = 'admin' and p.active
  and not exists (
    select 1 from notificacion n
    where n.user_id = p.id and n.ot_id_orden = o.ot_id_orden
  );

drop table if exists notificacion_ot_leida;

-- ---------------------------------------------------------------------
-- 6. Realtime, so the bell updates live
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table notificacion;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
