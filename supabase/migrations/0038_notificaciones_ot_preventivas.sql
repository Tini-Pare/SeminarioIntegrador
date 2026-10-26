-- =====================================================================
-- Notifications for preventive OTs (HU-065)
--
-- Replaces pm_dias_aviso and v_alertas_preventivas with a notification
-- log for emitted preventive work orders. Admins are notified whenever
-- an OT of type 'preventivo' is generated from a maintenance plan.
-- Unread/read status is persisted in notificacion_ot_leida per admin user.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table: notificacion_ot_leida
-- ---------------------------------------------------------------------
create table if not exists notificacion_ot_leida (
  notif_id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ot_id_orden int not null references orden_de_trabajo(ot_id_orden) on delete cascade,
  fecha_leida timestamptz not null default now(),
  constraint uq_user_ot_leida unique (user_id, ot_id_orden)
);

alter table notificacion_ot_leida enable row level security;

drop policy if exists "notificacion_ot_leida_user_all" on notificacion_ot_leida;
create policy "notificacion_ot_leida_user_all" on notificacion_ot_leida
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on notificacion_ot_leida to authenticated;

do $$
begin
  alter publication supabase_realtime add table notificacion_ot_leida;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Drop views that depend on pm_dias_aviso
-- ---------------------------------------------------------------------
drop view if exists v_alertas_preventivas cascade;
drop view if exists v_planes_mantenimiento cascade;

-- ---------------------------------------------------------------------
-- 3. Revert pm_dias_aviso from plan_mantenimiento
-- ---------------------------------------------------------------------
alter table plan_mantenimiento
  drop constraint if exists plan_mantenimiento_pm_dias_aviso_check;

alter table plan_mantenimiento
  drop column if exists pm_dias_aviso cascade;

-- ---------------------------------------------------------------------
-- 4. Restore clean crear_plan_mantenimiento and editar_plan_mantenimiento
-- ---------------------------------------------------------------------
drop function if exists crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int);
drop function if exists crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb);

create or replace function crear_plan_mantenimiento(
  p_te_id int,
  p_nombre varchar,
  p_descripcion varchar,
  p_frecuencia int,
  p_estado varchar,
  p_tareas int[],
  p_equipos jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_pm_id int;
begin
  if current_role_name() is distinct from 'admin' then
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

  insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
  select v_pm_id, eq_id_equipo, null
    from equipo
    where te_id = p_te_id
      and eq_estado_registro = 'activo'
      and not eq_pendiente_instalacion;

  if coalesce(p_estado, 'activo') = 'activo' then
    perform generar_ots_preventivas(v_pm_id);
  end if;

  return v_pm_id;
end;
$$;

drop function if exists editar_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb, int);
drop function if exists editar_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb);

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
begin
  if current_role_name() is distinct from 'admin' then
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

  if coalesce(p_estado, 'activo') = 'activo' then
    perform generar_ots_preventivas(p_pm_id);
  end if;
end;
$$;

grant execute on function crear_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb) to authenticated;
grant execute on function editar_plan_mantenimiento(int, varchar, varchar, int, varchar, int[], jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Restore v_planes_mantenimiento without pm_dias_aviso
-- ---------------------------------------------------------------------
create or replace view v_planes_mantenimiento
with (security_invoker = true) as
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
    when bool_or(me.eq_id_equipo is not null and me.me_fecha_ult_mant is null) then current_date
    else min(me.me_fecha_ult_mant + p.pm_frecuencia)
  end as prox_vencimiento
from plan_mantenimiento p
join tipos_de_equipos t on t.te_id = p.te_id
left join tarea_prevista_plan tp on tp.pm_id_plan = p.pm_id_plan
left join mantenimiento_equipo me on me.pm_id_plan = p.pm_id_plan
group by p.pm_id_plan, p.te_id, t.te_nombre, p.pm_nombre_plan, p.pm_descripcion_plan,
  p.pm_frecuencia, p.pm_estado;

grant select on v_planes_mantenimiento to authenticated;
