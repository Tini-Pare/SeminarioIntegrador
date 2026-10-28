-- =====================================================================
-- HU-068 (SCRUM-59): a técnico gets notified of a falla crítica
--
-- A falla is critical when its OT is correctivo with prioridad Alta (the
-- admin sets it when generating the OT; solicitudes have no urgency since
-- 0016 — same rule as isCriticalTask in src/lib/queries/alerts.ts). Until
-- now the técnico only saw it inside their queue (nav count, banner). Now
-- the técnico it's assigned to gets a notificacion row, shown in their own
-- bell, the moment they have to act:
--
--   * a tarea of a critical OT is assigned to them (new tarea, or an
--     existing one reassigned to them);
--   * an OT where they have an unfinished tarea is raised to prioridad Alta.
--
-- One unread notification per técnico and OT: two tareas of the same OT,
-- or a reassign back and forth, don't pile up rows. Finished tareas don't
-- notify, and only active técnicos get them. When a tarea is reassigned
-- away, the previous técnico's unread notification for that OT goes too if
-- they have nothing left to do there. Nothing is backfilled: what's already
-- assigned keeps showing in the queue as before.
--
-- Also adds tareas_realizadas_orden to the realtime publication: the
-- técnico's nav count (and the queue, OT and equipo screens that already
-- listen to it) only refreshed on navigation, because changes to that
-- table were never broadcast.
--
-- Numbered 0045: 0042/0043 were applied and removed, and
-- 0042_correcciones_qa.sql calls itself 0044.
--
-- Idempotent: constraints dropped and re-added, create or replace,
-- triggers drop-then-create, publication add guarded. Run in the SQL
-- Editor after 0042_correcciones_qa.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. notificacion accepts falla_critica (always about an OT)
-- ---------------------------------------------------------------------
alter table notificacion drop constraint if exists notificacion_no_tipo_check;
alter table notificacion add constraint notificacion_no_tipo_check
  check (no_tipo in ('ot_preventiva', 'stock_bajo', 'sin_stock', 'falla_critica'));

alter table notificacion drop constraint if exists notificacion_referencia_check;
alter table notificacion add constraint notificacion_referencia_check check (
  (no_tipo in ('ot_preventiva', 'falla_critica') and ot_id_orden is not null)
  or (no_tipo in ('stock_bajo', 'sin_stock') and rep_id is not null)
);

-- ---------------------------------------------------------------------
-- 2. notificar_falla_critica: one row for that técnico, if still an
--    active técnico and without an unread one for the same OT
-- ---------------------------------------------------------------------
create or replace function notificar_falla_critica(p_tecnico uuid, p_ot_id int)
returns void
language sql security definer
set search_path = public
as $$
  insert into notificacion (user_id, no_tipo, ot_id_orden)
  select p.id, 'falla_critica', p_ot_id
    from profiles p
    where p.id = p_tecnico
      and p.role = 'technician'
      and p.active
      and not exists (
        select 1 from notificacion n
        where n.user_id = p_tecnico
          and n.no_tipo = 'falla_critica'
          and n.ot_id_orden = p_ot_id
          and not n.no_leida
      );
$$;

-- Only the triggers below call it. Supabase grants execute to anon and
-- authenticated on its own, so revoking from public alone would still let
-- any client forge notifications over RPC. Same for 0040's helper.
revoke execute on function notificar_falla_critica(uuid, int) from public, anon, authenticated;
revoke execute on function notificar_admins(varchar, int, int, int, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Trigger on tareas_realizadas_orden: a tarea of a critical OT is
--    assigned (insert) or reassigned (p_id_tecnico changes) to a técnico.
--    security definer: the admin assigning it can't write another
--    user's notificaciones.
-- ---------------------------------------------------------------------
create or replace function notificar_tarea_falla_critica() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.taro_fecha_fin is not null or new.p_id_tecnico is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.p_id_tecnico is not distinct from old.p_id_tecnico then
    return new;
  end if;

  -- Reassigned away: the previous técnico's unread notice for this OT is
  -- stale unless they still have an unfinished tarea on it.
  if tg_op = 'UPDATE' and old.p_id_tecnico is not null and not exists (
    select 1 from tareas_realizadas_orden t
    where t.ot_id_orden = new.ot_id_orden
      and t.p_id_tecnico = old.p_id_tecnico
      and t.taro_fecha_fin is null
  ) then
    delete from notificacion
      where user_id = old.p_id_tecnico
        and no_tipo = 'falla_critica'
        and ot_id_orden = new.ot_id_orden
        and not no_leida;
  end if;

  if exists (
    select 1 from orden_de_trabajo o
    where o.ot_id_orden = new.ot_id_orden
      and o.ot_tipo_orden = 'correctivo'
      and o.ot_prioridad = 'high'
  ) then
    perform notificar_falla_critica(new.p_id_tecnico, new.ot_id_orden);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_tarea_falla_critica on tareas_realizadas_orden;
create trigger trg_notificar_tarea_falla_critica
  after insert or update of p_id_tecnico on tareas_realizadas_orden
  for each row execute function notificar_tarea_falla_critica();

-- ---------------------------------------------------------------------
-- 4. Trigger on orden_de_trabajo: a correctivo OT is raised to prioridad
--    Alta — every técnico with an unfinished tarea on it is notified.
-- ---------------------------------------------------------------------
create or replace function notificar_ot_falla_critica() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_tecnico uuid;
begin
  for v_tecnico in
    select distinct t.p_id_tecnico
      from tareas_realizadas_orden t
      where t.ot_id_orden = new.ot_id_orden
        and t.taro_fecha_fin is null
        and t.p_id_tecnico is not null
  loop
    perform notificar_falla_critica(v_tecnico, new.ot_id_orden);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notificar_ot_falla_critica on orden_de_trabajo;
create trigger trg_notificar_ot_falla_critica
  after update of ot_prioridad on orden_de_trabajo
  for each row
  when (
    new.ot_tipo_orden = 'correctivo'
    and new.ot_prioridad = 'high'
    and old.ot_prioridad is distinct from new.ot_prioridad
  )
  execute function notificar_ot_falla_critica();

-- ---------------------------------------------------------------------
-- 5. Realtime on tareas_realizadas_orden, so the técnico's count and the
--    screens listening to it update live. Realtime follows the table's
--    select RLS (0018), which lets admins and técnicos read every tarea —
--    the listeners just reload what each one is allowed to see.
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table tareas_realizadas_orden;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
