-- =====================================================================
-- Sprint 3 — Gestion de consumibles / repuestos
--
--   SCRUM-20  alta de repuestos (ABM, admin)
--   SCRUM-21  ingreso de stock via compras + linea_compra (admin)
--   SCRUM-22  pedido de compra del tecnico (crear + workflow de estado)
--   SCRUM-23  consulta de stock (tecnico, solo lectura)
--
-- repuestos / proveedores / tipos_proveedores / compras / linea_compra /
-- pedido_compra / linea_pedido ya existen desde 0003 pero estaban con RLS
-- admin-only ("<tabla>: admin only", el loop do-block al final de 0003) y
-- sin UI. Este script:
--   - reemplaza esas policies por unas granulares segun el rol que cada
--     pantalla nueva necesita
--   - agrega las columnas/defaults/checks que la UI necesita y 0003 no tiene
--   - agrega dos funciones security definer para que el alta de una compra
--     (compra + lineas + incremento de rep_cantidad_actual) y la resolucion
--     de un pedido sean atomicas
--   - suma repuestos y pedido_compra a Realtime
--
-- Idempotente: se puede correr de nuevo entero sin romper (columnas con
-- "if not exists", constraints con drop-then-add, type/publication con
-- do-block que traga el duplicate_object). Correr en el SQL Editor despues
-- de 0009 (ver supabase/SETUP.md).
-- =====================================================================

-- ---------------------------------------------------------------------
-- repuestos: cantidad_actual / stock_minimo pasan a NOT NULL con default
-- 0 (la UI siempre muestra un numero, nunca un guion), rep_estado pasa a
-- activo/inactivo con default 'activo', y el nombre se hace unico
-- (case/trim-insensitive) igual que tareas_generales (0005) y fallo (0006).
-- ---------------------------------------------------------------------
alter table repuestos alter column rep_cantidad_actual set default 0;
update repuestos set rep_cantidad_actual = 0 where rep_cantidad_actual is null;
alter table repuestos alter column rep_cantidad_actual set not null;

alter table repuestos alter column rep_stock_minimo set default 0;
update repuestos set rep_stock_minimo = 0 where rep_stock_minimo is null;
alter table repuestos alter column rep_stock_minimo set not null;

alter table repuestos alter column rep_estado set default 'activo';
update repuestos set rep_estado = 'activo'
  where rep_estado is null or btrim(rep_estado) not in ('activo', 'inactivo');
alter table repuestos alter column rep_estado set not null;

alter table repuestos drop constraint if exists repuestos_estado_chk;
alter table repuestos add constraint repuestos_estado_chk
  check (rep_estado in ('activo', 'inactivo'));

alter table repuestos drop constraint if exists repuestos_stock_no_negativo_chk;
alter table repuestos add constraint repuestos_stock_no_negativo_chk
  check (rep_cantidad_actual >= 0);

create unique index if not exists repuestos_nombre_unico_idx
  on repuestos (lower(btrim(rep_nombre)));

-- ---------------------------------------------------------------------
-- proveedores: tp_id (rubro) pasa a opcional — la UI de proveedores lo
-- resuelve como texto libre contra tipos_proveedores (find-or-create) y no
-- siempre hay rubro cargado. Nombre unico igual que repuestos.
-- ---------------------------------------------------------------------
alter table proveedores alter column tp_id drop not null;

create unique index if not exists proveedores_nombre_unico_idx
  on proveedores (lower(btrim(prov_nombre)));

-- ---------------------------------------------------------------------
-- compras: fecha por defecto hoy + quien la registro (audit, mismo patron
-- que historial.hi_autor_id / orden_de_trabajo.ot_p_id_responsable).
-- ---------------------------------------------------------------------
alter table compras alter column co_fecha_compra set default current_date;
alter table compras add column if not exists co_p_id_registrador uuid references profiles(id);

alter table linea_compra drop constraint if exists linea_compra_cantidad_chk;
alter table linea_compra add constraint linea_compra_cantidad_chk
  check (lc_cantidad is null or lc_cantidad > 0);

-- ---------------------------------------------------------------------
-- pedido_compra: ped_estado pasa de varchar libre a un enum con workflow
-- (pendiente -> aprobado/rechazado -> recibido), mas los campos de
-- resolucion (quien, cuando, por que se rechazo) y una observacion libre
-- del tecnico.
-- ---------------------------------------------------------------------
do $$
begin
  create type pedido_estado_t as enum ('pendiente', 'aprobado', 'rechazado', 'recibido');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  -- Solo convertir si todavia es el varchar original (data_type
  -- 'character varying'); en una segunda corrida ya es 'USER-DEFINED' y
  -- btrim(enum) no existe. DDL plano dentro del bloque, sin dollar-quoting
  -- anidado (algunos splitters de SQL lo cortan mal).
  if (
    select data_type from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pedido_compra'
      and column_name = 'ped_estado'
  ) <> 'USER-DEFINED' then
    alter table pedido_compra alter column ped_estado drop default;
    alter table pedido_compra
      alter column ped_estado type pedido_estado_t
      using coalesce(nullif(btrim(ped_estado), ''), 'pendiente')::pedido_estado_t;
  end if;
end $$;

alter table pedido_compra alter column ped_estado set default 'pendiente';
update pedido_compra set ped_estado = 'pendiente' where ped_estado is null;
alter table pedido_compra alter column ped_estado set not null;

alter table pedido_compra alter column ped_fecha_solicitud set default current_date;

alter table pedido_compra add column if not exists ped_observacion      text;
alter table pedido_compra add column if not exists ped_motivo_rechazo   text;
alter table pedido_compra add column if not exists ped_p_id_resolutor   uuid references profiles(id);
alter table pedido_compra add column if not exists ped_fecha_resolucion date;

alter table linea_pedido drop constraint if exists linea_pedido_cantidad_chk;
alter table linea_pedido add constraint linea_pedido_cantidad_chk
  check (lp_cantidad is null or lp_cantidad > 0);

-- =====================================================================
-- RLS — reemplaza las policies "admin only" de 0003 por unas granulares.
-- (Los GRANT a authenticated sobre estas tablas ya estan en 0003.)
--
-- Cada policy se dropea antes de crearse (tanto el nombre viejo de 0003
-- como el nuevo) para que esta seccion sea re-ejecutable aunque una
-- corrida anterior haya quedado a mitad de camino.
-- =====================================================================

-- repuestos: cualquier autenticado lee (SCRUM-23, el tecnico consulta
-- stock); solo admin da de alta / edita / borra (SCRUM-20).
drop policy if exists "repuestos: admin only" on repuestos;
drop policy if exists "repuestos: any authenticated read" on repuestos;
drop policy if exists "repuestos: admin inserts" on repuestos;
drop policy if exists "repuestos: admin updates" on repuestos;
drop policy if exists "repuestos: admin deletes" on repuestos;
create policy "repuestos: any authenticated read" on repuestos
  for select using (auth.uid() is not null);
create policy "repuestos: admin inserts" on repuestos
  for insert with check (current_role_name() = 'admin');
create policy "repuestos: admin updates" on repuestos
  for update using (current_role_name() = 'admin');
create policy "repuestos: admin deletes" on repuestos
  for delete using (current_role_name() = 'admin');

-- tipos_proveedores: catalogo FIJO de rubros. Solo lectura desde la app —
-- se carga a mano en el SQL Editor (que corre como superusuario y saltea
-- RLS). El modal de proveedor solo deja elegir de esta lista, no agregar.
-- Rubros sugeridos (INSERT de ejemplo, ajustar a gusto):
--   insert into tipos_proveedores (tp_nombre_rubro) values
--     ('Refrigeracion'), ('Climatizacion / HVAC'), ('Electricidad'),
--     ('Plomeria y sanitarios'), ('Herreria y cerrajeria'),
--     ('Equipamiento gastronomico'), ('Balanzas y pesaje'),
--     ('Puntos de venta / cajas'), ('Autoelevadores y zorras'),
--     ('Estanterias y gondolas'), ('Sistemas contra incendios'),
--     ('Seguridad electronica (CCTV, alarmas)'),
--     ('Aberturas y vidrieria'), ('Ferreteria industrial'),
--     ('Lubricantes y quimicos de mantenimiento');
drop policy if exists "tipos_proveedores: admin only" on tipos_proveedores;
drop policy if exists "tipos_proveedores: any authenticated read" on tipos_proveedores;
drop policy if exists "tipos_proveedores: admin inserts" on tipos_proveedores;
drop policy if exists "tipos_proveedores: admin updates" on tipos_proveedores;
drop policy if exists "tipos_proveedores: admin deletes" on tipos_proveedores;
create policy "tipos_proveedores: any authenticated read" on tipos_proveedores
  for select using (auth.uid() is not null);

-- proveedores: lectura amplia (nombres de proveedor en listados de compra),
-- ABM admin.
drop policy if exists "proveedores: admin only" on proveedores;
drop policy if exists "proveedores: any authenticated read" on proveedores;
drop policy if exists "proveedores: admin inserts" on proveedores;
drop policy if exists "proveedores: admin updates" on proveedores;
drop policy if exists "proveedores: admin deletes" on proveedores;
create policy "proveedores: any authenticated read" on proveedores
  for select using (auth.uid() is not null);
create policy "proveedores: admin inserts" on proveedores
  for insert with check (current_role_name() = 'admin');
create policy "proveedores: admin updates" on proveedores
  for update using (current_role_name() = 'admin');
create policy "proveedores: admin deletes" on proveedores
  for delete using (current_role_name() = 'admin');

-- compras / linea_compra: solo admin (SCRUM-21). Inmutables una vez
-- registradas — no hay policy de update/delete a proposito.
drop policy if exists "compras: admin only" on compras;
drop policy if exists "compras: admin read" on compras;
drop policy if exists "compras: admin inserts" on compras;
create policy "compras: admin read" on compras
  for select using (current_role_name() = 'admin');
create policy "compras: admin inserts" on compras
  for insert with check (current_role_name() = 'admin');

drop policy if exists "linea_compra: admin only" on linea_compra;
drop policy if exists "linea_compra: admin read" on linea_compra;
drop policy if exists "linea_compra: admin inserts" on linea_compra;
create policy "linea_compra: admin read" on linea_compra
  for select using (current_role_name() = 'admin');
create policy "linea_compra: admin inserts" on linea_compra
  for insert with check (current_role_name() = 'admin');

-- pedido_compra: el tecnico crea y ve los suyos; el admin ve todos y los
-- resuelve (SCRUM-22).
drop policy if exists "pedido_compra: admin only" on pedido_compra;
drop policy if exists "pedido_compra: read own or admin" on pedido_compra;
drop policy if exists "pedido_compra: technician/admin insert own" on pedido_compra;
drop policy if exists "pedido_compra: admin resolves" on pedido_compra;
create policy "pedido_compra: read own or admin" on pedido_compra
  for select using (
    p_id_tecnico = auth.uid()
    or current_role_name() = 'admin'
  );
create policy "pedido_compra: technician/admin insert own" on pedido_compra
  for insert with check (
    p_id_tecnico = auth.uid()
    and current_role_name() in ('technician', 'admin')
  );
create policy "pedido_compra: admin resolves" on pedido_compra
  for update using (current_role_name() = 'admin');

-- linea_pedido: mismo alcance que su pedido padre.
drop policy if exists "linea_pedido: admin only" on linea_pedido;
drop policy if exists "linea_pedido: read via pedido" on linea_pedido;
drop policy if exists "linea_pedido: insert via own pedido" on linea_pedido;
create policy "linea_pedido: read via pedido" on linea_pedido
  for select using (
    exists (
      select 1 from pedido_compra pc
      where pc.ped_id_ped_compra = linea_pedido.ped_id_ped_compra
        and (pc.p_id_tecnico = auth.uid() or current_role_name() = 'admin')
    )
  );
create policy "linea_pedido: insert via own pedido" on linea_pedido
  for insert with check (
    exists (
      select 1 from pedido_compra pc
      where pc.ped_id_ped_compra = linea_pedido.ped_id_ped_compra
        and pc.p_id_tecnico = auth.uid()
    )
  );

-- =====================================================================
-- registrar_compra — alta de una compra en una sola transaccion:
-- inserta compras, inserta cada linea_compra, y suma la cantidad de cada
-- linea a repuestos.rep_cantidad_actual (SCRUM-21). Opcionalmente marca un
-- pedido_compra como 'recibido' y lo enlaza a esta compra.
--
-- security definer: el incremento de stock toca repuestos, que para un no
-- admin es de solo lectura; la funcion valida el rol admin ella misma
-- antes de tocar nada. p_lineas: jsonb array de
-- {"rep_id": int, "cantidad": int, "costo_unitario": number|null}.
-- =====================================================================
create or replace function registrar_compra(
  p_prov_id_proveedor  int,
  p_co_nombre          text,
  p_co_fecha_compra    date,
  p_co_garantia        text,
  p_lineas             jsonb,
  p_ped_id_ped_compra  int default null
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_co_id       int;
  v_linea       jsonb;
  v_nro         int := 0;
  v_total       numeric(12, 2) := 0;
  v_rep_id      int;
  v_cantidad    int;
  v_costo_unit  numeric(12, 2);
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede registrar compras'
      using errcode = 'insufficient_privilege';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La compra necesita al menos una linea de repuesto';
  end if;

  insert into compras (
    prov_id_proveedor, co_nombre, co_fecha_compra, co_garantia,
    co_costo_total, co_p_id_registrador
  )
  values (
    p_prov_id_proveedor,
    nullif(btrim(p_co_nombre), ''),
    coalesce(p_co_fecha_compra, current_date),
    nullif(btrim(p_co_garantia), ''),
    0,
    auth.uid()
  )
  returning co_id_compra into v_co_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_nro := v_nro + 1;
    v_rep_id := (v_linea ->> 'rep_id')::int;
    v_cantidad := (v_linea ->> 'cantidad')::int;
    v_costo_unit := nullif(v_linea ->> 'costo_unitario', '')::numeric(12, 2);

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada linea debe ser mayor a cero';
    end if;

    insert into linea_compra (co_id_compra, rep_id, lc_nro_linea, lc_cantidad, lc_costo_unitario)
    values (v_co_id, v_rep_id, v_nro, v_cantidad, v_costo_unit);

    update repuestos
      set rep_cantidad_actual = rep_cantidad_actual + v_cantidad
      where rep_id = v_rep_id;

    if not found then
      raise exception 'El repuesto % no existe', v_rep_id;
    end if;

    v_total := v_total + (v_cantidad * coalesce(v_costo_unit, 0));
  end loop;

  update compras set co_costo_total = v_total where co_id_compra = v_co_id;

  if p_ped_id_ped_compra is not null then
    update pedido_compra
      set co_id_compra = v_co_id,
          ped_estado = 'recibido',
          ped_p_id_resolutor = auth.uid(),
          ped_fecha_resolucion = current_date
      where ped_id_ped_compra = p_ped_id_ped_compra;
  end if;

  return v_co_id;
end;
$$;

grant execute on function registrar_compra(int, text, date, text, jsonb, int) to authenticated;

-- =====================================================================
-- resolver_pedido_compra — el admin aprueba / rechaza / marca recibido un
-- pedido de compra (SCRUM-22). 'recibido' aca es solo el cambio de estado;
-- el ingreso de stock real lo hace registrar_compra (que tambien puede
-- marcar el pedido recibido de una).
-- =====================================================================
create or replace function resolver_pedido_compra(
  p_ped_id  int,
  p_estado  text,
  p_motivo  text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede resolver pedidos de compra'
      using errcode = 'insufficient_privilege';
  end if;

  if p_estado not in ('aprobado', 'rechazado', 'recibido') then
    raise exception 'Estado invalido: %', p_estado;
  end if;

  update pedido_compra
    set ped_estado = p_estado::pedido_estado_t,
        ped_motivo_rechazo = case when p_estado = 'rechazado'
          then nullif(btrim(p_motivo), '') end,
        ped_p_id_resolutor = auth.uid(),
        ped_fecha_resolucion = current_date
    where ped_id_ped_compra = p_ped_id;

  if not found then
    raise exception 'El pedido % no existe', p_ped_id;
  end if;
end;
$$;

grant execute on function resolver_pedido_compra(int, text, text) to authenticated;

-- =====================================================================
-- Realtime — la pantalla de repuestos y la de pedidos se suscriben a
-- postgres_changes igual que equipo/solicitudes/orden_de_trabajo.
-- =====================================================================
do $$
begin
  alter publication supabase_realtime add table repuestos;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table pedido_compra;
exception
  when duplicate_object then null;
end $$;
