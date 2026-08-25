-- =====================================================================
-- Replaces the 0001 schema (equipment/faults/history/maintenance_plan)
-- with the maintenance-management model from 0002_gestion_mantenimiento.sql,
-- adapted to:
--   - keep Supabase Auth + profiles as the identity/role backbone (0002's
--     own personal/tecnico_interno login tables are dropped — profiles
--     already covers admin/technician/user, and current_role_name() from
--     0001 is reused as-is)
--   - split "faults" into solicitudes (the initial report) + orden_de_trabajo
--     (the work order created once a technician takes it), since 0002
--     already models requests and work orders as separate concepts
--   - int identity primary keys instead of hand-assigned ints (0002's own
--     header comment allows this substitution)
--   - a handful of columns 0002 doesn't have but the app needs: equipo.eq_codigo
--     (equipment code, used throughout the UI), solicitudes.sol_urgencia /
--     sol_foto_url (report urgency + photo)
-- The rest of 0002's model (proveedores, compras, repuestos, planes de
-- mantenimiento preventivo, catalogo de fallas, etc.) is created as-is
-- (with FKs that pointed at personal(p_legajo) redirected to profiles(id))
-- but has no UI yet in this app — locked to admin-only RLS until it does.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Drop the 0001 tables/type/function this migration replaces
-- ---------------------------------------------------------------------
drop table if exists faults cascade;
drop table if exists history cascade;
drop table if exists maintenance_plan cascade;
drop table if exists equipment cascade;
drop function if exists sync_equipment_status(uuid);
drop type if exists fault_status_t;

-- equipment_status_t, urgency_t and role_t (from 0001) are reused as-is.

-- ---------------------------------------------------------------------
-- Drop this migration's own tables/types/function too, so the whole file
-- is safe to re-run from scratch after a failed/partial attempt (the SQL
-- Editor does not wrap the pasted script in a single transaction — a
-- later statement failing does not roll back the ones that already ran).
-- ---------------------------------------------------------------------
drop table if exists linea_pedido cascade;
drop table if exists pedido_compra cascade;
drop table if exists linea_compra cascade;
drop table if exists compras cascade;
drop table if exists proveedores cascade;
drop table if exists tipos_proveedores cascade;
drop table if exists repuesto_para_tarea cascade;
drop table if exists repuestos cascade;
drop table if exists tareas_realizadas_orden cascade;
drop table if exists fallo_por_orden cascade;
drop table if exists fallo cascade;
drop table if exists prestador_externo cascade;
drop table if exists especialidades_externo cascade;
drop table if exists historial cascade;
drop table if exists orden_de_trabajo cascade;
drop table if exists solicitudes cascade;
drop table if exists tarea_prevista_plan cascade;
drop table if exists tareas_generales cascade;
drop table if exists mantenimiento_equipo cascade;
drop table if exists plan_mantenimiento cascade;
drop table if exists equipo cascade;
drop table if exists tipos_de_equipos cascade;
drop table if exists lugares cascade;
drop function if exists sync_equipo_estado(int);
drop type if exists solicitud_estado_t;
drop type if exists orden_estado_t;

create type orden_estado_t as enum ('assigned', 'in_progress', 'resolved');
create type solicitud_estado_t as enum ('pendiente', 'en_proceso', 'resuelta');

-- ---------------------------------------------------------------------
-- lugares
-- ---------------------------------------------------------------------
create table lugares (
    lu_codigo        int generated always as identity primary key,
    lu_nombre_sector varchar(100) not null,
    lu_piso          varchar(20)
);

-- ---------------------------------------------------------------------
-- tipos_de_equipos
-- ---------------------------------------------------------------------
create table tipos_de_equipos (
    te_id       int generated always as identity primary key,
    te_nombre   varchar(100) not null,
    te_cantidad int
);

-- ---------------------------------------------------------------------
-- equipo
-- ---------------------------------------------------------------------
-- eq_codigo is an addition on top of 0002's raw model: the app shows a
-- short equipment code everywhere (search, cards, badges) and 0002 has no
-- equivalent column. eq_estado reuses 0001's equipment_status_t enum
-- instead of 0002's free varchar(50) — sync_equipo_estado() below is its
-- single writer, same invariant as 0001's sync_equipment_status().
create table equipo (
    eq_id_equipo         int generated always as identity primary key,
    te_id                int not null references tipos_de_equipos(te_id),
    lu_codigo            int not null references lugares(lu_codigo),
    eq_codigo             text not null unique,
    eq_nombre            varchar(100) not null,
    eq_estado            equipment_status_t not null default 'operational',
    eq_modelo            varchar(100),
    eq_fecha_garantia    date,
    eq_fecha_instalacion date
);

-- ---------------------------------------------------------------------
-- plan_mantenimiento / mantenimiento_equipo / tareas_generales /
-- tarea_prevista_plan — created early (orden_de_trabajo references
-- plan_mantenimiento). No UI yet, same as today's dead maintenance_plan.
-- ---------------------------------------------------------------------
create table plan_mantenimiento (
    pm_id_plan          int generated always as identity primary key,
    pm_nombre_plan      varchar(100) not null,
    pm_descripcion_plan varchar(255),
    pm_frecuencia       varchar(50),
    pm_estado           varchar(50)
);

create table mantenimiento_equipo (
    pm_id_plan             int not null references plan_mantenimiento(pm_id_plan),
    te_id                  int not null references tipos_de_equipos(te_id),
    me_fecha_mantenimiento date,
    primary key (pm_id_plan, te_id)
);

create table tareas_generales (
    tag_id_tarea          int generated always as identity primary key,
    tag_nombre_tarea      varchar(100) not null,
    tag_descripcion_tarea varchar(255)
);

create table tarea_prevista_plan (
    tag_id_tarea int not null references tareas_generales(tag_id_tarea),
    pm_id_plan   int not null references plan_mantenimiento(pm_id_plan),
    primary key (tag_id_tarea, pm_id_plan)
);

-- ---------------------------------------------------------------------
-- solicitudes — the initial fault report ("reportar falla"). sol_urgencia
-- and sol_foto_url are additions on top of 0002's raw model: the app
-- needs both and 0002 has neither. p_legajo_admin is kept nullable and
-- unused for now (0002 has it not null; this app doesn't assign an admin
-- at report time).
-- ---------------------------------------------------------------------
create table solicitudes (
    sol_id_solicitud     int generated always as identity primary key,
    eq_id_equipo         int not null references equipo(eq_id_equipo) on delete cascade,
    p_legajo_solicitante uuid not null references profiles(id),
    p_legajo_admin       uuid references profiles(id),
    sol_descripcion      text not null,
    sol_urgencia         urgency_t not null default 'medium',
    sol_foto_url         text,
    sol_estado           solicitud_estado_t not null default 'pendiente',
    sol_fecha_hora       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- orden_de_trabajo — created when a technician takes a solicitud (or,
-- eventually, from a maintenance plan via plan_id_manequipo — unused for
-- now). ot_p_id_responsable replaces 0002's p_legajo_admin (int, not
-- null): here it's the technician who took the order, references
-- profiles directly.
-- ---------------------------------------------------------------------
create table orden_de_trabajo (
    ot_id_orden          int generated always as identity primary key,
    sol_id_solicitud     int references solicitudes(sol_id_solicitud),
    plan_id_manequipo    int references plan_mantenimiento(pm_id_plan),
    eq_id_equipo         int not null references equipo(eq_id_equipo) on delete cascade,
    ot_p_id_responsable  uuid not null references profiles(id),
    ot_tipo_orden        varchar(50) not null default 'correctivo',
    ot_fecha_inicio      date not null default current_date,
    ot_fecha_fin         date,
    ot_observacion       varchar(255),
    ot_estado            orden_estado_t not null default 'assigned',
    ot_prioridad         urgency_t not null default 'medium'
);

-- ---------------------------------------------------------------------
-- historial — not part of 0002; kept from 0001 (the app's equipment
-- detail "Historial" tab has no equivalent anywhere in 0002's model).
-- ---------------------------------------------------------------------
create table historial (
    hi_id         uuid primary key default gen_random_uuid(),
    eq_id_equipo  int not null references equipo(eq_id_equipo) on delete cascade,
    hi_tipo       text not null,
    hi_nota       text not null,
    hi_autor_id   uuid not null references profiles(id),
    hi_fecha_hora timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- especialidades_externo / prestador_externo
-- ---------------------------------------------------------------------
create table especialidades_externo (
    ee_id          int generated always as identity primary key,
    ee_nombre      varchar(100) not null,
    ee_descripcion varchar(255)
);

create table prestador_externo (
    pe_cuit_cuil varchar(20) primary key,
    ee_id        int not null references especialidades_externo(ee_id),
    pe_nombre    varchar(100) not null,
    pe_email     varchar(100),
    pe_contacto  varchar(100)
);

-- ---------------------------------------------------------------------
-- fallo / fallo_por_orden — fault catalog, unused (descriptions stay
-- free text on solicitudes.sol_descripcion, as today).
-- ---------------------------------------------------------------------
create table fallo (
    fa_id_fallo    int generated always as identity primary key,
    fa_nombre      varchar(100) not null,
    fa_desperfecto varchar(255),
    fa_gravedad    varchar(50)
);

create table fallo_por_orden (
    fa_id_fallo         int not null references fallo(fa_id_fallo),
    ot_id_orden         int not null references orden_de_trabajo(ot_id_orden),
    fpo_fecha_deteccion date,
    primary key (fa_id_fallo, ot_id_orden)
);

-- ---------------------------------------------------------------------
-- tareas_realizadas_orden — p_legajo_tecnico redirected from
-- tecnico_interno(p_legajo) to profiles(id) since tecnico_interno isn't
-- created (profiles + role='technician' replaces it).
-- ---------------------------------------------------------------------
create table tareas_realizadas_orden (
    taro_id_tarea_orden int generated always as identity primary key,
    ot_id_orden          int not null references orden_de_trabajo(ot_id_orden),
    tag_id_tarea         int not null references tareas_generales(tag_id_tarea),
    pe_cuit_cuil         varchar(20) references prestador_externo(pe_cuit_cuil),
    p_id_tecnico         uuid references profiles(id),
    taro_fecha_inicio    date,
    taro_fecha_fin       date,
    constraint chk_tareo_responsable_xor check (
        (pe_cuit_cuil is not null and p_id_tecnico is null)
        or
        (pe_cuit_cuil is null and p_id_tecnico is not null)
    )
);

-- ---------------------------------------------------------------------
-- repuestos / repuesto_para_tarea
-- ---------------------------------------------------------------------
create table repuestos (
    rep_id              int generated always as identity primary key,
    rep_nombre          varchar(100) not null,
    rep_cantidad_actual int,
    rep_stock_minimo    int,
    rep_stock_maximo    int,
    rep_estado          varchar(50)
);

create table repuesto_para_tarea (
    taro_id_tarea_orden int not null references tareas_realizadas_orden(taro_id_tarea_orden),
    rep_id              int not null references repuestos(rep_id),
    repta_canti_usada   int,
    repta_desc_uso      varchar(255),
    primary key (taro_id_tarea_orden, rep_id)
);

-- ---------------------------------------------------------------------
-- tipos_proveedores / proveedores / compras / linea_compra
-- ---------------------------------------------------------------------
create table tipos_proveedores (
    tp_id           int generated always as identity primary key,
    tp_nombre_rubro varchar(100) not null,
    tp_descripcion  varchar(255)
);

create table proveedores (
    prov_id_proveedor int generated always as identity primary key,
    tp_id             int not null references tipos_proveedores(tp_id),
    prov_nombre       varchar(100) not null,
    prov_telefono     varchar(30),
    prov_correo       varchar(100)
);

create table compras (
    co_id_compra      int generated always as identity primary key,
    prov_id_proveedor int not null references proveedores(prov_id_proveedor),
    co_garantia       varchar(100),
    co_nombre         varchar(100),
    co_fecha_compra   date,
    co_costo_total    decimal(12,2)
);

create table linea_compra (
    co_id_compra      int not null references compras(co_id_compra),
    rep_id            int not null references repuestos(rep_id),
    lc_nro_linea      int,
    lc_cantidad       int,
    lc_costo_unitario decimal(12,2),
    primary key (co_id_compra, rep_id)
);

-- ---------------------------------------------------------------------
-- pedido_compra / linea_pedido — p_legajo_tecnico redirected from
-- personal(p_legajo) to profiles(id), same reasoning as
-- tareas_realizadas_orden above.
-- ---------------------------------------------------------------------
create table pedido_compra (
    ped_id_ped_compra   int generated always as identity primary key,
    p_id_tecnico        uuid not null references profiles(id),
    co_id_compra        int references compras(co_id_compra),
    ped_fecha_solicitud date,
    ped_estado          varchar(50)
);

create table linea_pedido (
    ped_id_ped_compra int not null references pedido_compra(ped_id_ped_compra),
    rep_id            int not null references repuestos(rep_id),
    lp_nro_linea      int,
    lp_cantidad       int,
    primary key (ped_id_ped_compra, rep_id)
);

-- =====================================================================
-- Grants (see 0001's comment on why these are required in addition to
-- RLS: Postgres checks table-level GRANTs before evaluating RLS).
-- =====================================================================
grant select on
  lugares, tipos_de_equipos, equipo,
  plan_mantenimiento, mantenimiento_equipo, tareas_generales, tarea_prevista_plan,
  fallo, fallo_por_orden, especialidades_externo, prestador_externo,
  tipos_proveedores, proveedores, compras, repuestos, linea_compra,
  pedido_compra, linea_pedido, tareas_realizadas_orden, repuesto_para_tarea
  to authenticated;
grant insert, update, delete on
  lugares, tipos_de_equipos, equipo,
  plan_mantenimiento, mantenimiento_equipo, tareas_generales, tarea_prevista_plan,
  fallo, fallo_por_orden, especialidades_externo, prestador_externo,
  tipos_proveedores, proveedores, compras, repuestos, linea_compra,
  pedido_compra, linea_pedido, tareas_realizadas_orden, repuesto_para_tarea
  to authenticated;
grant select, insert on historial to authenticated;
grant select, insert, update on solicitudes, orden_de_trabajo to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table lugares enable row level security;
alter table tipos_de_equipos enable row level security;
alter table equipo enable row level security;
alter table solicitudes enable row level security;
alter table orden_de_trabajo enable row level security;
alter table historial enable row level security;

create policy "lugares: any authenticated read" on lugares
  for select using (auth.uid() is not null);
create policy "lugares: admin inserts" on lugares
  for insert with check (current_role_name() = 'admin');
create policy "lugares: admin updates" on lugares
  for update using (current_role_name() = 'admin');
create policy "lugares: admin deletes" on lugares
  for delete using (current_role_name() = 'admin');

create policy "tipos_de_equipos: any authenticated read" on tipos_de_equipos
  for select using (auth.uid() is not null);
create policy "tipos_de_equipos: admin inserts" on tipos_de_equipos
  for insert with check (current_role_name() = 'admin');
create policy "tipos_de_equipos: admin updates" on tipos_de_equipos
  for update using (current_role_name() = 'admin');
create policy "tipos_de_equipos: admin deletes" on tipos_de_equipos
  for delete using (current_role_name() = 'admin');

create policy "equipo: any authenticated read" on equipo
  for select using (auth.uid() is not null);
create policy "equipo: admin inserts" on equipo
  for insert with check (current_role_name() = 'admin');
create policy "equipo: admin updates" on equipo
  for update using (current_role_name() = 'admin');
create policy "equipo: admin deletes" on equipo
  for delete using (current_role_name() = 'admin');

create policy "solicitudes: read own or admin/technician" on solicitudes
  for select using (
    p_legajo_solicitante = auth.uid()
    or current_role_name() in ('admin', 'technician')
  );
create policy "solicitudes: authenticated insert own" on solicitudes
  for insert with check (p_legajo_solicitante = auth.uid());
create policy "solicitudes: technician/admin update" on solicitudes
  for update using (current_role_name() in ('admin', 'technician'));

create policy "orden_de_trabajo: read own solicitud, assigned, or admin/technician" on orden_de_trabajo
  for select using (
    ot_p_id_responsable = auth.uid()
    or current_role_name() in ('admin', 'technician')
    or exists (
      select 1 from solicitudes s
      where s.sol_id_solicitud = orden_de_trabajo.sol_id_solicitud
        and s.p_legajo_solicitante = auth.uid()
    )
  );
create policy "orden_de_trabajo: technician/admin insert" on orden_de_trabajo
  for insert with check (current_role_name() in ('admin', 'technician'));
create policy "orden_de_trabajo: technician/admin update" on orden_de_trabajo
  for update using (current_role_name() in ('admin', 'technician'));

create policy "historial: any authenticated read" on historial
  for select using (auth.uid() is not null);
create policy "historial: authenticated insert own" on historial
  for insert with check (hi_autor_id = auth.uid());

-- Tables with no UI yet in this pass: RLS enabled, admin-only for
-- everything (safe default; not worth finer-grained policies until a
-- screen actually needs them).
do $$
declare
  t text;
begin
  foreach t in array array[
    'plan_mantenimiento', 'mantenimiento_equipo', 'tareas_generales', 'tarea_prevista_plan',
    'fallo', 'fallo_por_orden', 'especialidades_externo', 'prestador_externo',
    'tipos_proveedores', 'proveedores', 'compras', 'repuestos', 'linea_compra',
    'pedido_compra', 'linea_pedido', 'tareas_realizadas_orden', 'repuesto_para_tarea'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (current_role_name() = ''admin'') with check (current_role_name() = ''admin'')',
      t || ': admin only', t
    );
  end loop;
end $$;

-- =====================================================================
-- equipo status auto-sync — replaces 0001's sync_equipment_status().
-- Single writer of equipo.eq_estado, called after every solicitud/orden
-- mutation. Same invariant: never editable by hand anywhere in the app.
-- =====================================================================
create function sync_equipo_estado(p_eq_id int) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_estado equipment_status_t;
begin
  select case
    when exists (
      select 1 from orden_de_trabajo
      where eq_id_equipo = p_eq_id and ot_estado = 'in_progress'
    ) then 'repair'
    when exists (
      select 1 from orden_de_trabajo
      where eq_id_equipo = p_eq_id and ot_estado = 'assigned'
    ) or exists (
      select 1 from solicitudes s
      where s.eq_id_equipo = p_eq_id
        and s.sol_estado = 'pendiente'
        and not exists (
          select 1 from orden_de_trabajo o where o.sol_id_solicitud = s.sol_id_solicitud
        )
    ) then 'waiting'
    else 'operational'
  end into v_estado;

  update equipo set eq_estado = v_estado where eq_id_equipo = p_eq_id;
end;
$$;

grant execute on function sync_equipo_estado(int) to authenticated;

-- =====================================================================
-- Realtime — replaces equipment/faults with equipo/solicitudes/orden_de_trabajo.
-- The fault-photos storage bucket and its policies are untouched (no
-- table dependency).
-- =====================================================================
alter publication supabase_realtime add table equipo;
alter publication supabase_realtime add table solicitudes;
alter publication supabase_realtime add table orden_de_trabajo;
