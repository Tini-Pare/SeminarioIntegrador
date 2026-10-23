-- =====================================================================
-- 0031_planes_mantenimiento.sql
-- Planes de mantenimiento preventivo, tareas previstas y fechas por equipo.
-- =====================================================================

-- 1. Ajuste de plan_mantenimiento
-- Agregar te_id si no existe
alter table plan_mantenimiento
  add column if not exists te_id int references tipos_de_equipos(te_id);

-- Convertir pm_frecuencia a entero con CHECK > 0
alter table plan_mantenimiento
  alter column pm_frecuencia type int using (nullif(regexp_replace(pm_frecuencia, '[^0-9]', '', 'g'), '')::int);

alter table plan_mantenimiento
  alter column pm_frecuencia set not null;

alter table plan_mantenimiento
  drop constraint if exists plan_mantenimiento_pm_frecuencia_check;

alter table plan_mantenimiento
  add constraint plan_mantenimiento_pm_frecuencia_check check (pm_frecuencia > 0);

-- Estado por defecto y check
alter table plan_mantenimiento
  alter column pm_estado set default 'activo';

alter table plan_mantenimiento
  drop constraint if exists plan_mantenimiento_pm_estado_check;

alter table plan_mantenimiento
  add constraint plan_mantenimiento_pm_estado_check check (pm_estado in ('activo', 'inactivo'));

-- R6: Indice unico sobre te_id + nombre normalizado
create unique index if not exists uq_plan_mantenimiento_tipo_nombre
  on plan_mantenimiento(te_id, lower(trim(pm_nombre_plan)));

-- 2. Recreacion de mantenimiento_equipo vinculada a equipo(eq_id_equipo)
drop table if exists mantenimiento_equipo cascade;

create table mantenimiento_equipo (
  pm_id_plan         int not null references plan_mantenimiento(pm_id_plan) on delete cascade,
  eq_id_equipo       int not null references equipo(eq_id_equipo) on delete cascade,
  me_fecha_ult_mant  date not null check (me_fecha_ult_mant <= current_date),
  primary key (pm_id_plan, eq_id_equipo)
);

-- Asegurar on delete cascade en tarea_prevista_plan
alter table tarea_prevista_plan
  drop constraint if exists tarea_prevista_plan_pm_id_plan_fkey;

alter table tarea_prevista_plan
  add constraint tarea_prevista_plan_pm_id_plan_fkey
  foreign key (pm_id_plan) references plan_mantenimiento(pm_id_plan) on delete cascade;

-- 3. Vista agregada para la grilla
create or replace view v_planes_mantenimiento as
select
  p.pm_id_plan,
  p.te_id,
  t.te_nombre,
  p.pm_nombre_plan,
  p.pm_descripcion_plan,
  p.pm_frecuencia,
  p.pm_estado,
  count(distinct tp.tag_id_tarea)::int as task_count,
  count(distinct me.eq_id_equipo)::int as equipment_count,
  case
    when p.pm_estado = 'inactivo' then null
    else min(me.me_fecha_ult_mant + p.pm_frecuencia)
  end as prox_vencimiento
from plan_mantenimiento p
join tipos_de_equipos t on t.te_id = p.te_id
left join tarea_prevista_plan tp on tp.pm_id_plan = p.pm_id_plan
left join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
group by p.pm_id_plan, p.te_id, t.te_nombre, p.pm_nombre_plan, p.pm_descripcion_plan, p.pm_frecuencia, p.pm_estado;

-- 4. RPC crear_plan_mantenimiento
create or replace function crear_plan_mantenimiento(
  p_te_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb -- array de objetos: [{"eq_id": 1, "fecha_ult_mant": "2026-10-01"}]
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_pm_id int;
  v_total_equipos_tipo int;
  v_eq_item jsonb;
  v_eq_id int;
  v_fecha date;
begin
  -- Control de rol R8
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede crear planes de mantenimiento';
  end if;

  -- R5: Frecuencia > 0
  if p_frecuencia <= 0 or p_frecuencia is null then
    raise exception 'La frecuencia debe ser mayor a 0 días';
  end if;

  -- R4: Al menos 1 tarea si esta activo
  if p_estado = 'activo' and (p_tareas is null or coalesce(array_length(p_tareas, 1), 0) = 0) then
    raise exception 'Un plan activo debe tener al menos una tarea prevista';
  end if;

  -- R6: Unicidad de nombre
  if exists (
    select 1 from plan_mantenimiento
    where te_id = p_te_id and lower(trim(pm_nombre_plan)) = lower(trim(p_nombre))
  ) then
    raise exception 'Ya existe un plan con el nombre "%" para este tipo de equipo', trim(p_nombre);
  end if;

  -- Contar equipos existentes para este tipo
  select count(*) into v_total_equipos_tipo
  from equipo
  where te_id = p_te_id and eq_estado_registro = 'activo';

  -- R2 y R3: Si hay equipos, se debe haber enviado fecha para todos
  if v_total_equipos_tipo > 0 then
    if p_equipos is null or jsonb_array_length(p_equipos) < v_total_equipos_tipo then
      raise exception 'Debe especificar la fecha de último mantenimiento para todos los equipos del tipo (% equipos)', v_total_equipos_tipo;
    end if;
  end if;

  -- Insertar plan
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

  -- Insertar tareas
  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), v_pm_id;
  end if;

  -- Insertar fechas por equipo
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

-- 5. RPC editar_plan_mantenimiento
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

  -- Actualizar datos base del plan (R7: te_id NO se modifica)
  update plan_mantenimiento
  set pm_nombre_plan = trim(p_nombre),
      pm_descripcion_plan = nullif(trim(p_descripcion), ''),
      pm_frecuencia = p_frecuencia,
      pm_estado = coalesce(p_estado, 'activo')
  where pm_id_plan = p_pm_id;

  -- Sincronizar tareas
  delete from tarea_prevista_plan where pm_id_plan = p_pm_id;
  if p_tareas is not null and array_length(p_tareas, 1) > 0 then
    insert into tarea_prevista_plan (tag_id_tarea, pm_id_plan)
    select distinct unnest(p_tareas), p_pm_id;
  end if;

  -- Actualizar fechas por equipo
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

-- 6. RPC eliminar_plan_mantenimiento
create or replace function eliminar_plan_mantenimiento(
  p_pm_id int
) returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede eliminar planes';
  end if;

  -- Si tiene OTs asociadas, no se borra
  if exists (select 1 from orden_de_trabajo where plan_id_manequipo = p_pm_id) then
    raise exception 'HAS_WORK_ORDERS: El plan tiene órdenes de trabajo asociadas y no puede ser eliminado físicamente. Debe darse de baja.';
  end if;

  delete from plan_mantenimiento where pm_id_plan = p_pm_id;
  return true;
end;
$$;

-- 7. Grants y RLS
grant select on v_planes_mantenimiento to authenticated;
grant select, insert, update, delete on plan_mantenimiento, mantenimiento_equipo, tarea_prevista_plan to authenticated;
grant execute on function crear_plan_mantenimiento to authenticated;
grant execute on function editar_plan_mantenimiento to authenticated;
grant execute on function eliminar_plan_mantenimiento to authenticated;

alter table plan_mantenimiento enable row level security;
alter table mantenimiento_equipo enable row level security;
alter table tarea_prevista_plan enable row level security;

-- Limpiar politicas viejas si existieran
drop policy if exists "plan_mantenimiento: admin only" on plan_mantenimiento;
drop policy if exists "mantenimiento_equipo: admin only" on mantenimiento_equipo;
drop policy if exists "tarea_prevista_plan: admin only" on tarea_prevista_plan;
drop policy if exists "plan_mantenimiento: admin all" on plan_mantenimiento;
drop policy if exists "mantenimiento_equipo: admin all" on mantenimiento_equipo;
drop policy if exists "tarea_prevista_plan: admin all" on tarea_prevista_plan;

-- Politicas RLS estrictas (R8)
create policy "plan_mantenimiento: admin all" on plan_mantenimiento
  for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

create policy "mantenimiento_equipo: admin all" on mantenimiento_equipo
  for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

create policy "tarea_prevista_plan: admin all" on tarea_prevista_plan
  for all using (current_role_name() = 'admin') with check (current_role_name() = 'admin');
