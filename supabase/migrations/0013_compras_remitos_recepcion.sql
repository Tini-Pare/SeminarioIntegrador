-- =====================================================================
-- Compras — remitos de recepcion contra una factura
--
-- Hasta esta migracion, registrar_compra sumaba el stock completo de
-- cada linea al momento de guardar la compra, sin importar el tipo de
-- comprobante. A partir de aca eso cambia SOLO para las facturas: una
-- factura es la "promesa" de lo que el proveedor va a entregar (trae
-- precio, pero no siempre llega junto), asi que ya no mueve stock al
-- guardarse. El stock recien se suma cuando se cargan remitos de
-- recepcion contra esa factura, uno por cada entrega parcial que
-- efectivamente llega — eso es lo que permiten las funciones nuevas de
-- este archivo (registrar_remito_compra / editar_remito_compra /
-- anular_remito_compra).
--
-- remito y tique (los otros dos co_tipo_comprobante, ver 0011) NO
-- cambian: no representan una promesa de entrega futura que haya que
-- trackear — un remito sin factura previa o un tique de mostrador ya
-- es, en si mismo, mercaderia en mano — asi que siguen sumando stock
-- completo al guardarse, exactamente como antes de esta migracion.
--
-- La cantidad recibida de cada linea de factura NO se cachea en ningun
-- lado: la UI siempre la calcula sumando remito_compra_linea para esa
-- linea. Por eso anular o editar un remito "recalcula sola" — no hay
-- ningun contador que actualizar, solo se vuelve a sumar.
--
-- Idempotente: create table if not exists, RLS con drop-then-create,
-- funciones con create or replace, el enum de storage no cambia.
-- =====================================================================

create table if not exists remito_compra (
  rc_id                int generated always as identity primary key,
  co_id_compra         int not null references compras(co_id_compra),
  rc_fecha             date not null default current_date,
  rc_p_id_registrador  uuid references profiles(id),
  rc_creado_en         timestamptz not null default now()
);

-- co_id_compra se repite aca (ademas de estar en remito_compra) porque
-- linea_compra tiene clave primaria compuesta (co_id_compra, rep_id) —
-- no hay un id sustituto de linea al que apuntar con una sola columna,
-- asi que la FK compuesta de abajo necesita ambas columnas presentes en
-- esta tabla tambien.
create table if not exists remito_compra_linea (
  rc_id         int not null references remito_compra(rc_id) on delete cascade,
  co_id_compra  int not null,
  rep_id        int not null,
  rcl_cantidad  int not null check (rcl_cantidad > 0),
  primary key (rc_id, rep_id),
  foreign key (co_id_compra, rep_id) references linea_compra(co_id_compra, rep_id)
);

grant select on remito_compra, remito_compra_linea to authenticated;
grant insert, update, delete on remito_compra, remito_compra_linea to authenticated;

alter table remito_compra enable row level security;
alter table remito_compra_linea enable row level security;

-- Mismo alcance que compras/linea_compra (0010): solo admin. Los inserts
-- reales pasan por las funciones security definer de mas abajo, pero se
-- deja la policy por el mismo motivo que 0010 la deja en compras/linea_compra.
drop policy if exists "remito_compra: admin read" on remito_compra;
drop policy if exists "remito_compra: admin inserts" on remito_compra;
create policy "remito_compra: admin read" on remito_compra
  for select using (current_role_name() = 'admin');
create policy "remito_compra: admin inserts" on remito_compra
  for insert with check (current_role_name() = 'admin');

drop policy if exists "remito_compra_linea: admin read" on remito_compra_linea;
drop policy if exists "remito_compra_linea: admin inserts" on remito_compra_linea;
create policy "remito_compra_linea: admin read" on remito_compra_linea
  for select using (current_role_name() = 'admin');
create policy "remito_compra_linea: admin inserts" on remito_compra_linea
  for insert with check (current_role_name() = 'admin');

do $$
begin
  alter publication supabase_realtime add table remito_compra;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table remito_compra_linea;
exception
  when duplicate_object then null;
end $$;

-- =====================================================================
-- registrar_compra — misma firma que 0011 (create or replace alcanza,
-- no cambio ningun parametro). Unico cambio: una factura ya no suma
-- stock en este paso (ver header de este archivo); remito/tique siguen
-- igual que siempre. El pedido_compra vinculado tampoco pasa a
-- 'recibido' de una si la compra es factura — eso lo hace
-- marcar_pedido_recibido_si_compra_completa cuando los remitos terminen
-- de cubrir todo lo facturado.
-- =====================================================================
create or replace function registrar_compra(
  p_prov_id_proveedor    int,
  p_co_nombre            text,
  p_co_fecha_compra      date,
  p_co_garantia          text,
  p_lineas               jsonb,
  p_ped_id_ped_compra    int default null,
  p_co_tipo_comprobante  text default 'factura',
  p_co_punto_venta       text default null
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

  if p_co_tipo_comprobante not in ('factura', 'remito', 'tique') then
    raise exception 'Tipo de comprobante invalido: %', p_co_tipo_comprobante;
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La compra necesita al menos una linea de repuesto';
  end if;

  insert into compras (
    prov_id_proveedor, co_nombre, co_fecha_compra, co_garantia,
    co_costo_total, co_p_id_registrador, co_tipo_comprobante, co_punto_venta
  )
  values (
    p_prov_id_proveedor,
    nullif(btrim(p_co_nombre), ''),
    coalesce(p_co_fecha_compra, current_date),
    nullif(btrim(p_co_garantia), ''),
    0,
    auth.uid(),
    p_co_tipo_comprobante::comprobante_tipo_t,
    nullif(btrim(p_co_punto_venta), '')
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

    if p_co_tipo_comprobante = 'factura' then
      -- No mueve stock todavia (ver header) — solo valida que el
      -- repuesto exista, para no descubrir un rep_id colgado recien
      -- cuando llegue el primer remito.
      if not exists (select 1 from repuestos where rep_id = v_rep_id) then
        raise exception 'El repuesto % no existe', v_rep_id;
      end if;
    else
      update repuestos
        set rep_cantidad_actual = rep_cantidad_actual + v_cantidad
        where rep_id = v_rep_id;

      if not found then
        raise exception 'El repuesto % no existe', v_rep_id;
      end if;
    end if;

    v_total := v_total + (v_cantidad * coalesce(v_costo_unit, 0));
  end loop;

  update compras set co_costo_total = v_total where co_id_compra = v_co_id;

  if p_ped_id_ped_compra is not null then
    update pedido_compra
      set co_id_compra = v_co_id,
          ped_p_id_resolutor = auth.uid(),
          ped_estado = case
            when p_co_tipo_comprobante = 'factura' then ped_estado
            else 'recibido'
          end,
          ped_fecha_resolucion = case
            when p_co_tipo_comprobante = 'factura' then ped_fecha_resolucion
            else current_date
          end
      where ped_id_ped_compra = p_ped_id_ped_compra;
  end if;

  return v_co_id;
end;
$$;

grant execute on function registrar_compra(int, text, date, text, jsonb, int, text, text) to authenticated;

-- =====================================================================
-- marcar_pedido_recibido_si_compra_completa — helper interno (no se
-- grantea execute; solo lo llaman las funciones de abajo, en el mismo
-- rol que las creo). Si TODAS las lineas de la compra ya tienen
-- recibido >= facturado, pasa el pedido_compra que apunte a esa compra
-- (si hay uno, y todavia no esta resuelto) a 'recibido'.
--
-- Solo empuja el estado hacia adelante: si un remito se anula y la
-- compra deja de estar completa, el pedido NO vuelve para atras solo —
-- ya se le aviso al tecnico que su pedido esta resuelto, revertir eso
-- solo porque el deposito corrigio un remito seria mas confuso que
-- util. Si hace falta, un admin lo reabre a mano.
-- =====================================================================
create or replace function marcar_pedido_recibido_si_compra_completa(p_co_id_compra int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_incompleta boolean;
begin
  select exists (
    select 1
    from linea_compra lc
    where lc.co_id_compra = p_co_id_compra
      and coalesce(lc.lc_cantidad, 0) > coalesce((
        select sum(rcl.rcl_cantidad)
        from remito_compra_linea rcl
        where rcl.co_id_compra = lc.co_id_compra and rcl.rep_id = lc.rep_id
      ), 0)
  ) into v_incompleta;

  if not v_incompleta then
    update pedido_compra
      set ped_estado = 'recibido',
          ped_p_id_resolutor = coalesce(ped_p_id_resolutor, auth.uid()),
          ped_fecha_resolucion = current_date
      where co_id_compra = p_co_id_compra
        and ped_estado not in ('recibido', 'rechazado');
  end if;
end;
$$;

-- =====================================================================
-- registrar_remito_compra — carga un remito de recepcion contra una
-- compra tipo factura. p_lineas: jsonb array de
-- {"rep_id": int, "cantidad": int}. Valida, por cada linea, que lo
-- recibido acumulado (sumando todos los remitos previos de esa linea)
-- mas esta cantidad no supere lo facturado. security definer: suma
-- stock, que para un no admin es de solo lectura.
-- =====================================================================
create or replace function registrar_remito_compra(
  p_co_id_compra  int,
  p_fecha         date,
  p_lineas        jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_rc_id      int;
  v_tipo       comprobante_tipo_t;
  v_linea      jsonb;
  v_rep_id     int;
  v_cantidad   int;
  v_facturado  int;
  v_recibido   int;
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede cargar remitos'
      using errcode = 'insufficient_privilege';
  end if;

  select co_tipo_comprobante into v_tipo from compras where co_id_compra = p_co_id_compra;
  if not found then
    raise exception 'La compra % no existe', p_co_id_compra;
  end if;
  if v_tipo <> 'factura' then
    raise exception 'Solo se pueden cargar remitos de recepcion contra una compra tipo factura';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El remito necesita al menos una linea';
  end if;

  insert into remito_compra (co_id_compra, rc_fecha, rc_p_id_registrador)
  values (p_co_id_compra, coalesce(p_fecha, current_date), auth.uid())
  returning rc_id into v_rc_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_rep_id := (v_linea ->> 'rep_id')::int;
    v_cantidad := (v_linea ->> 'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada linea del remito debe ser mayor a cero';
    end if;

    select lc_cantidad into v_facturado
      from linea_compra
      where co_id_compra = p_co_id_compra and rep_id = v_rep_id;
    if not found then
      raise exception 'El repuesto % no pertenece a esta compra', v_rep_id;
    end if;

    select coalesce(sum(rcl_cantidad), 0) into v_recibido
      from remito_compra_linea
      where co_id_compra = p_co_id_compra and rep_id = v_rep_id;

    if v_recibido + v_cantidad > coalesce(v_facturado, 0) then
      raise exception 'La cantidad recibida del repuesto % supera lo facturado (ya recibido % de %)',
        v_rep_id, v_recibido, coalesce(v_facturado, 0);
    end if;

    insert into remito_compra_linea (rc_id, co_id_compra, rep_id, rcl_cantidad)
    values (v_rc_id, p_co_id_compra, v_rep_id, v_cantidad);

    update repuestos
      set rep_cantidad_actual = rep_cantidad_actual + v_cantidad
      where rep_id = v_rep_id;
  end loop;

  perform marcar_pedido_recibido_si_compra_completa(p_co_id_compra);

  return v_rc_id;
end;
$$;

grant execute on function registrar_remito_compra(int, date, jsonb) to authenticated;

-- =====================================================================
-- editar_remito_compra — reemplaza fecha + lineas de un remito ya
-- cargado. Revierte primero el stock de las lineas viejas y las borra;
-- despues corre la misma validacion de tope + insercion que
-- registrar_remito_compra (el tope ya no cuenta las lineas viejas de
-- este remito porque se borraron antes de validar).
-- =====================================================================
create or replace function editar_remito_compra(
  p_rc_id   int,
  p_fecha   date,
  p_lineas  jsonb
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_co_id_compra int;
  v_linea        jsonb;
  v_rep_id       int;
  v_cantidad     int;
  v_facturado    int;
  v_recibido     int;
  v_old          record;
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede editar remitos'
      using errcode = 'insufficient_privilege';
  end if;

  select co_id_compra into v_co_id_compra from remito_compra where rc_id = p_rc_id;
  if not found then
    raise exception 'El remito % no existe', p_rc_id;
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El remito necesita al menos una linea';
  end if;

  for v_old in select rep_id, rcl_cantidad from remito_compra_linea where rc_id = p_rc_id
  loop
    update repuestos
      set rep_cantidad_actual = rep_cantidad_actual - v_old.rcl_cantidad
      where rep_id = v_old.rep_id;
  end loop;
  delete from remito_compra_linea where rc_id = p_rc_id;

  update remito_compra set rc_fecha = coalesce(p_fecha, current_date) where rc_id = p_rc_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_rep_id := (v_linea ->> 'rep_id')::int;
    v_cantidad := (v_linea ->> 'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada linea del remito debe ser mayor a cero';
    end if;

    select lc_cantidad into v_facturado
      from linea_compra
      where co_id_compra = v_co_id_compra and rep_id = v_rep_id;
    if not found then
      raise exception 'El repuesto % no pertenece a esta compra', v_rep_id;
    end if;

    select coalesce(sum(rcl_cantidad), 0) into v_recibido
      from remito_compra_linea
      where co_id_compra = v_co_id_compra and rep_id = v_rep_id;

    if v_recibido + v_cantidad > coalesce(v_facturado, 0) then
      raise exception 'La cantidad recibida del repuesto % supera lo facturado (ya recibido % de %)',
        v_rep_id, v_recibido, coalesce(v_facturado, 0);
    end if;

    insert into remito_compra_linea (rc_id, co_id_compra, rep_id, rcl_cantidad)
    values (p_rc_id, v_co_id_compra, v_rep_id, v_cantidad);

    update repuestos
      set rep_cantidad_actual = rep_cantidad_actual + v_cantidad
      where rep_id = v_rep_id;
  end loop;

  perform marcar_pedido_recibido_si_compra_completa(v_co_id_compra);
end;
$$;

grant execute on function editar_remito_compra(int, date, jsonb) to authenticated;

-- =====================================================================
-- anular_remito_compra — revierte el stock de sus lineas y borra el
-- remito (las lineas caen por on delete cascade). Si el stock ya se
-- gasto en una tarea desde que llego el remito, rep_cantidad_actual
-- puede no llegar a cubrir la resta y el update de repuestos dispara el
-- check rep_cantidad_actual >= 0 — en ese caso la anulacion falla y el
-- remito queda como estaba, a proposito (no hay forma consistente de
-- anular una recepcion cuyo stock ya se uso).
-- =====================================================================
create or replace function anular_remito_compra(p_rc_id int) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_old record;
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede anular remitos'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from remito_compra where rc_id = p_rc_id) then
    raise exception 'El remito % no existe', p_rc_id;
  end if;

  for v_old in select rep_id, rcl_cantidad from remito_compra_linea where rc_id = p_rc_id
  loop
    update repuestos
      set rep_cantidad_actual = rep_cantidad_actual - v_old.rcl_cantidad
      where rep_id = v_old.rep_id;
  end loop;

  delete from remito_compra where rc_id = p_rc_id;
end;
$$;

grant execute on function anular_remito_compra(int) to authenticated;
