-- =====================================================================
-- Alta de equipo, with or without installation (builds on 0032)
--
-- alta_equipo is now the only way the app creates an equipo:
--   * already installed: needs its installation date (not in the future)
--     and joins every plan of its tipo right away, with that date as its
--     last maintenance — same as finalizar_tarea does on installation.
--   * pendiente de instalación: no date yet. It's created with an OT of
--     type 'instalacion' holding the "Instalación de equipo" tarea,
--     assigned to the técnico chosen in the alta. Finishing that tarea
--     (finalizar_tarea, 0032) fills in the date and adds it to the plans.
-- Everything in one transaction: a bad técnico or a duplicate código
-- leaves no half-created equipo behind.
--
-- A pending equipo can't have fallas reported on it (it isn't working
-- yet), and can't have an installation date until it's installed.
-- =====================================================================

-- Pending means "no installation date yet".
alter table equipo
  drop constraint if exists equipo_pendiente_sin_fecha_chk;
alter table equipo
  add constraint equipo_pendiente_sin_fecha_chk
  check (not eq_pendiente_instalacion or eq_fecha_instalacion is null);

-- ---------------------------------------------------------------------
-- No solicitudes on an equipo that isn't installed yet
-- ---------------------------------------------------------------------
create or replace function trg_solicitud_equipo_instalado() returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from equipo
    where eq_id_equipo = new.eq_id_equipo and eq_pendiente_instalacion
  ) then
    raise exception 'El equipo todavía no está instalado: no se pueden reportar fallas sobre él';
  end if;
  return new;
end;
$$;

drop trigger if exists solicitudes_equipo_instalado on solicitudes;
create trigger solicitudes_equipo_instalado
  before insert or update of eq_id_equipo on solicitudes
  for each row execute function trg_solicitud_equipo_instalado();

-- ---------------------------------------------------------------------
-- alta_equipo
-- ---------------------------------------------------------------------
create or replace function alta_equipo(
  p_codigo              text,
  p_nombre              varchar,
  p_te_id               int,
  p_lu_codigo           int,
  p_modelo              varchar,
  p_pendiente           boolean,
  p_fecha_instalacion   date      default null, -- installed only
  p_tecnico             uuid      default null, -- pending only
  p_prioridad           urgency_t default null  -- pending only
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_eq_id    int;
  v_ot_id    int;
  v_tarea_id int;
begin
  if current_role_name() is distinct from 'admin' then
    raise exception 'Solo un administrador puede dar de alta equipos';
  end if;

  if p_pendiente then
    if p_tecnico is null then
      raise exception 'Elegí el técnico que va a instalar el equipo';
    end if;
    if not exists (select 1 from profiles where id = p_tecnico and role = 'technician') then
      raise exception 'El técnico elegido no existe';
    end if;
    if p_prioridad is null then
      raise exception 'Elegí la prioridad de la instalación';
    end if;

    select tag_id_tarea into v_tarea_id
      from tareas_generales where tag_codigo_sistema = 'instalacion';
    if v_tarea_id is null then
      raise exception 'Falta la tarea de sistema "Instalación de equipo" (migración 0032)';
    end if;
  else
    if p_fecha_instalacion is null then
      raise exception 'Ingresá la fecha de instalación';
    end if;
    if p_fecha_instalacion > current_date then
      raise exception 'La fecha de instalación no puede ser posterior a hoy';
    end if;
  end if;

  insert into equipo (
    eq_codigo, eq_nombre, te_id, lu_codigo, eq_modelo,
    eq_fecha_instalacion, eq_pendiente_instalacion
  ) values (
    btrim(p_codigo), btrim(p_nombre), p_te_id, p_lu_codigo, nullif(btrim(p_modelo), ''),
    case when p_pendiente then null else p_fecha_instalacion end, p_pendiente
  ) returning eq_id_equipo into v_eq_id;

  if p_pendiente then
    insert into orden_de_trabajo (
      eq_id_equipo, ot_tipo_orden, ot_prioridad, ot_observacion
    ) values (
      v_eq_id, 'instalacion', p_prioridad, 'Instalación y puesta en marcha del equipo nuevo.'
    ) returning ot_id_orden into v_ot_id;

    -- sync_orden_estado (0017) runs on this insert and leaves the OT
    -- 'assigned' until the técnico starts the tarea.
    insert into tareas_realizadas_orden (ot_id_orden, tag_id_tarea, p_id_tecnico)
    values (v_ot_id, v_tarea_id, p_tecnico);

    insert into historial (eq_id_equipo, hi_tipo, hi_nota, hi_autor_id)
    values (v_eq_id, 'Asignada', 'Orden de instalación generada para el equipo nuevo.', auth.uid());

    perform sync_equipo_estado(v_eq_id);
  else
    insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
    select pm_id_plan, v_eq_id, p_fecha_instalacion
      from plan_mantenimiento
      where te_id = p_te_id;
  end if;

  return jsonb_build_object('eq_id', v_eq_id, 'ot_id', v_ot_id);
end;
$$;

grant execute on function alta_equipo(text, varchar, int, int, varchar, boolean, date, uuid, urgency_t)
  to authenticated;
