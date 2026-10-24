-- =====================================================================
-- Equipo installation as an OT
--
-- A new equipo can be registered as "pendiente de instalación": it gets an
-- OT of type 'instalacion' holding a system tarea, "Instalación de equipo"
-- (the OT itself is created from the alta de equipo, next step). Finishing
-- that tarea is what installs the equipo:
--   * equipo.eq_fecha_instalacion = the day it was finished
--   * eq_pendiente_instalacion goes back to false
--   * the equipo joins every plan de mantenimiento of its tipo, with that
--     same date as its last maintenance (mantenimiento_equipo)
--
-- Until then a pending equipo stays out of the plans: crear_plan doesn't
-- require a date for it, and neither crear_plan nor editar_plan accept one.
-- Equipos registered as already installed (and every existing one) keep
-- eq_pendiente_instalacion = false and work as before.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. OT types. ot_tipo_orden has been free text defaulting to
-- 'correctivo' (the only value the app ever wrote).
-- ---------------------------------------------------------------------
alter table orden_de_trabajo
  drop constraint if exists orden_de_trabajo_tipo_chk;
alter table orden_de_trabajo
  add constraint orden_de_trabajo_tipo_chk
  check (ot_tipo_orden in ('correctivo', 'preventivo', 'instalacion'));

-- ---------------------------------------------------------------------
-- 2. Pending-installation flag on equipo
-- ---------------------------------------------------------------------
alter table equipo
  add column if not exists eq_pendiente_instalacion boolean not null default false;

-- ---------------------------------------------------------------------
-- 3. System tareas: a tarea genérica the app relies on, identified by a
-- fixed code instead of its id or name. Null on every regular tarea.
-- ---------------------------------------------------------------------
alter table tareas_generales
  add column if not exists tag_codigo_sistema varchar(30);

create unique index if not exists tareas_generales_codigo_sistema_idx
  on tareas_generales (tag_codigo_sistema)
  where tag_codigo_sistema is not null;

-- Reuse a tarea already named like that (the name is unique, 0005) instead
-- of failing on the unique index.
update tareas_generales
  set tag_codigo_sistema = 'instalacion',
      tag_estado = 'activo'
  where lower(btrim(tag_nombre_tarea)) = 'instalación de equipo'
    and tag_codigo_sistema is null
    and not exists (
      select 1 from tareas_generales where tag_codigo_sistema = 'instalacion'
    );

insert into tareas_generales (tag_nombre_tarea, tag_descripcion_tarea, tag_estado, tag_codigo_sistema)
select 'Instalación de equipo',
       'Instalación y puesta en marcha de un equipo nuevo. Al finalizarla se registra la fecha de instalación y el equipo se incorpora a los planes de mantenimiento de su tipo.',
       'activo',
       'instalacion'
where not exists (select 1 from tareas_generales where tag_codigo_sistema = 'instalacion');

-- The app hides system tareas from the catalog, but RLS still lets an
-- admin update/delete any row: this is the backstop.
create or replace function trg_proteger_tarea_sistema() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.tag_codigo_sistema is not null then
      raise exception 'No se puede crear una tarea de sistema';
    end if;
    return new;
  end if;

  if old.tag_codigo_sistema is not null then
    raise exception 'La tarea "%" la usa el sistema y no se puede modificar ni eliminar',
      old.tag_nombre_tarea;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.tag_codigo_sistema is not null then
    raise exception 'No se puede convertir una tarea en tarea de sistema';
  end if;

  return new;
end;
$$;

drop trigger if exists tareas_generales_proteger_sistema on tareas_generales;
create trigger tareas_generales_proteger_sistema
  before insert or update or delete on tareas_generales
  for each row execute function trg_proteger_tarea_sistema();

-- The installation tarea is never part of a plan...
create or replace function trg_tarea_plan_no_sistema() returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from tareas_generales
    where tag_id_tarea = new.tag_id_tarea and tag_codigo_sistema is not null
  ) then
    raise exception 'La tarea de instalación no se puede incluir en un plan de mantenimiento';
  end if;
  return new;
end;
$$;

drop trigger if exists tarea_prevista_plan_no_sistema on tarea_prevista_plan;
create trigger tarea_prevista_plan_no_sistema
  before insert or update of tag_id_tarea on tarea_prevista_plan
  for each row execute function trg_tarea_plan_no_sistema();

-- ...and only goes in an OT of type 'instalacion' (finishing it installs
-- the equipo, which makes no sense on a correctivo).
create or replace function trg_tarea_instalacion_solo_en_ot_instalacion() returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from tareas_generales
    where tag_id_tarea = new.tag_id_tarea and tag_codigo_sistema = 'instalacion'
  ) and not exists (
    select 1 from orden_de_trabajo
    where ot_id_orden = new.ot_id_orden and ot_tipo_orden = 'instalacion'
  ) then
    raise exception 'La tarea de instalación solo puede ir en una orden de instalación';
  end if;
  return new;
end;
$$;

drop trigger if exists tareas_realizadas_orden_instalacion on tareas_realizadas_orden;
create trigger tareas_realizadas_orden_instalacion
  before insert or update of tag_id_tarea, ot_id_orden on tareas_realizadas_orden
  for each row execute function trg_tarea_instalacion_solo_en_ot_instalacion();

-- ---------------------------------------------------------------------
-- 4. finalizar_tarea — same as 0030, plus: finishing the installation
-- tarea installs the equipo and adds it to its tipo's plans.
-- ---------------------------------------------------------------------
create or replace function finalizar_tarea(
  p_taro_id_tarea_orden int,
  p_repuestos           jsonb default null,
  p_diagnostico         text  default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_p_id_tecnico        uuid;
  v_taro_fecha_inicio   date;
  v_taro_fecha_fin      date;
  v_taro_fecha_susp     date;
  v_taro_fecha_fin_susp date;
  v_codigo_sistema      varchar(30);
  v_eq_id               int;
  v_te_id               int;
  v_planes              int;
  v_linea               jsonb;
  v_rep_id              int;
  v_cantidad            int;
  v_diagnostico         text := nullif(btrim(p_diagnostico), '');
begin
  select t.p_id_tecnico, t.taro_fecha_inicio, t.taro_fecha_fin, t.taro_fecha_suspension,
         t.taro_fecha_fin_suspension, g.tag_codigo_sistema, o.eq_id_equipo
    into v_p_id_tecnico, v_taro_fecha_inicio, v_taro_fecha_fin, v_taro_fecha_susp,
         v_taro_fecha_fin_susp, v_codigo_sistema, v_eq_id
    from tareas_realizadas_orden t
    join tareas_generales g on g.tag_id_tarea = t.tag_id_tarea
    join orden_de_trabajo o on o.ot_id_orden = t.ot_id_orden
    where t.taro_id_tarea_orden = p_taro_id_tarea_orden;

  if not found then
    raise exception 'La tarea % no existe', p_taro_id_tarea_orden;
  end if;

  if v_p_id_tecnico is distinct from auth.uid() then
    raise exception 'Solo el técnico asignado puede finalizar esta tarea'
      using errcode = 'insufficient_privilege';
  end if;

  if v_taro_fecha_inicio is null then
    raise exception 'Iniciá la tarea antes de finalizarla';
  end if;

  if v_taro_fecha_fin is not null then
    raise exception 'Esta tarea ya está finalizada';
  end if;

  if v_taro_fecha_susp is not null and v_taro_fecha_fin_susp is null then
    raise exception 'La tarea está suspendida: reanudala antes de finalizarla';
  end if;

  if char_length(v_diagnostico) > 500 then
    raise exception 'El diagnóstico no puede superar los 500 caracteres';
  end if;

  if p_repuestos is not null then
    for v_linea in select * from jsonb_array_elements(p_repuestos)
    loop
      v_rep_id := (v_linea ->> 'rep_id')::int;
      v_cantidad := (v_linea ->> 'cantidad')::int;

      if v_cantidad is null or v_cantidad <= 0 then
        raise exception 'La cantidad de cada repuesto usado debe ser mayor a cero';
      end if;

      insert into repuesto_para_tarea (taro_id_tarea_orden, rep_id, repta_canti_usada)
      values (p_taro_id_tarea_orden, v_rep_id, v_cantidad);

      update repuestos
        set rep_cantidad_actual = rep_cantidad_actual - v_cantidad
        where rep_id = v_rep_id;

      if not found then
        raise exception 'El repuesto % no existe', v_rep_id;
      end if;
    end loop;
  end if;

  update tareas_realizadas_orden
    set taro_fecha_fin = current_date,
        taro_diagnostico = v_diagnostico
    where taro_id_tarea_orden = p_taro_id_tarea_orden;

  if v_codigo_sistema = 'instalacion' then
    update equipo
      set eq_fecha_instalacion = current_date,
          eq_pendiente_instalacion = false
      where eq_id_equipo = v_eq_id
      returning te_id into v_te_id;

    -- Every plan of the tipo, inactive ones too: v_planes_mantenimiento
    -- already ignores those, and the equipo is there if one is reactivated.
    -- An existing row (the admin had added the equipo by hand) takes the
    -- real installation date.
    insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
    select pm_id_plan, v_eq_id, current_date
      from plan_mantenimiento
      where te_id = v_te_id
    on conflict (pm_id_plan, eq_id_equipo)
      do update set me_fecha_ult_mant = excluded.me_fecha_ult_mant;
    get diagnostics v_planes = row_count;

    insert into historial (eq_id_equipo, hi_tipo, hi_nota, hi_autor_id)
    values (
      v_eq_id,
      'Instalación',
      case
        when v_planes = 0 then format(
          'Equipo instalado el %s. Su tipo todavía no tiene planes de mantenimiento.',
          to_char(current_date, 'DD/MM/YYYY'))
        when v_planes = 1 then format(
          'Equipo instalado el %s. Se incorporó a 1 plan de mantenimiento de su tipo.',
          to_char(current_date, 'DD/MM/YYYY'))
        else format(
          'Equipo instalado el %s. Se incorporó a %s planes de mantenimiento de su tipo.',
          to_char(current_date, 'DD/MM/YYYY'), v_planes)
      end,
      auth.uid()
    );
  end if;
end;
$$;

grant execute on function finalizar_tarea(int, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Plans: validate the equipos sent with a plan. Each one must exist,
-- be active, be of the plan's tipo, be installed, and appear once.
-- p_exigir_todos (crear_plan): every installed active equipo of the tipo
-- must have a date. Also fixes 0031 only comparing how many came in.
-- ---------------------------------------------------------------------
create or replace function validar_equipos_plan(
  p_te_id        int,
  p_equipos      jsonb,
  p_exigir_todos boolean
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_ids        int[];
  v_invalido   int;
  v_faltantes  int;
begin
  select coalesce(array_agg((e->>'eq_id')::int), '{}')
    into v_ids
    from jsonb_array_elements(coalesce(p_equipos, '[]'::jsonb)) e;

  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'Hay equipos repetidos en el plan';
  end if;

  select x into v_invalido
    from unnest(v_ids) x
    where not exists (
      select 1 from equipo
      where eq_id_equipo = x
        and te_id = p_te_id
        and eq_estado_registro = 'activo'
        and not eq_pendiente_instalacion
    )
    limit 1;

  if v_invalido is not null then
    raise exception 'El equipo % no es un equipo instalado y activo de este tipo', v_invalido;
  end if;

  if p_exigir_todos then
    select count(*) into v_faltantes
      from equipo
      where te_id = p_te_id
        and eq_estado_registro = 'activo'
        and not eq_pendiente_instalacion
        and eq_id_equipo <> all (v_ids);

    if v_faltantes > 0 then
      raise exception 'Debe especificar la fecha de último mantenimiento para todos los equipos del tipo (faltan %)', v_faltantes;
    end if;
  end if;
end;
$$;

-- crear_plan_mantenimiento — same as 0031, with validar_equipos_plan in
-- place of the count check.
create or replace function crear_plan_mantenimiento(
  p_te_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb -- [{"eq_id": 1, "fecha_ult_mant": "2026-10-01"}]
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_pm_id int;
  v_eq_item jsonb;
  v_eq_id int;
  v_fecha date;
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede crear planes de mantenimiento';
  end if;

  if p_frecuencia <= 0 or p_frecuencia is null then
    raise exception 'La frecuencia debe ser mayor a 0 días';
  end if;

  if p_estado = 'activo' and (p_tareas is null or coalesce(array_length(p_tareas, 1), 0) = 0) then
    raise exception 'Un plan activo debe tener al menos una tarea prevista';
  end if;

  if exists (
    select 1 from plan_mantenimiento
    where te_id = p_te_id and lower(trim(pm_nombre_plan)) = lower(trim(p_nombre))
  ) then
    raise exception 'Ya existe un plan con el nombre "%" para este tipo de equipo', trim(p_nombre);
  end if;

  perform validar_equipos_plan(p_te_id, p_equipos, true);

  insert into plan_mantenimiento (
    te_id,
    pm_nombre_plan,
    pm_descripcion_plan,
    pm_frecuencia,
    pm_estado
  ) values (
    p_te_id,
    trim(p_nombre),
    nullif(trim(p_descripcion), ''),
    p_frecuencia,
    coalesce(p_estado, 'activo')
  ) returning pm_id_plan into v_pm_id;

  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), v_pm_id;
  end if;

  if p_equipos is not null and jsonb_array_length(p_equipos) > 0 then
    for v_eq_item in select * from jsonb_array_elements(p_equipos)
    loop
      v_eq_id := (v_eq_item->>'eq_id')::int;
      v_fecha := (v_eq_item->>'fecha_ult_mant')::date;

      if v_fecha > current_date then
        raise exception 'La fecha de último mantenimiento no puede ser futura';
      end if;

      insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
      values (v_pm_id, v_eq_id, v_fecha);
    end loop;
  end if;

  return v_pm_id;
end;
$$;

-- editar_plan_mantenimiento — same as 0031, plus validar_equipos_plan
-- (without requiring every equipo: the edit modal only lists the ones
-- already in the plan).
create or replace function editar_plan_mantenimiento(
  p_pm_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_te_id int;
  v_eq_item jsonb;
  v_eq_id int;
  v_fecha date;
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede editar planes de mantenimiento';
  end if;

  select te_id into v_te_id from plan_mantenimiento where pm_id_plan = p_pm_id;
  if not found then
    raise exception 'Plan de mantenimiento no encontrado';
  end if;

  if p_frecuencia <= 0 or p_frecuencia is null then
    raise exception 'La frecuencia debe ser mayor a 0 días';
  end if;

  if p_estado = 'activo' and (p_tareas is null or coalesce(array_length(p_tareas, 1), 0) = 0) then
    raise exception 'Un plan activo debe tener al menos una tarea prevista';
  end if;

  if exists (
    select 1 from plan_mantenimiento
    where te_id = v_te_id
      and pm_id_plan <> p_pm_id
      and lower(trim(pm_nombre_plan)) = lower(trim(p_nombre))
  ) then
    raise exception 'Ya existe otro plan con el nombre "%" para este tipo de equipo', trim(p_nombre);
  end if;

  perform validar_equipos_plan(v_te_id, p_equipos, false);

  update plan_mantenimiento
  set pm_nombre_plan = trim(p_nombre),
      pm_descripcion_plan = nullif(trim(p_descripcion), ''),
      pm_frecuencia = p_frecuencia,
      pm_estado = coalesce(p_estado, 'activo')
  where pm_id_plan = p_pm_id;

  delete from tarea_prevista_plan where pm_id_plan = p_pm_id;
  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), p_pm_id;
  end if;

  if p_equipos is not null and jsonb_array_length(p_equipos) > 0 then
    for v_eq_item in select * from jsonb_array_elements(p_equipos)
    loop
      v_eq_id := (v_eq_item->>'eq_id')::int;
      v_fecha := (v_eq_item->>'fecha_ult_mant')::date;

      if v_fecha > current_date then
        raise exception 'La fecha de último mantenimiento no puede ser futura';
      end if;

      insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
      values (p_pm_id, v_eq_id, v_fecha)
      on conflict (pm_id_plan, eq_id_equipo)
      do update set me_fecha_ult_mant = excluded.me_fecha_ult_mant;
    end loop;
  end if;
end;
$$;

grant execute on function crear_plan_mantenimiento to authenticated;
grant execute on function editar_plan_mantenimiento to authenticated;
