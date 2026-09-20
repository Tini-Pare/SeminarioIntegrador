-- =====================================================================
-- Compras — tipo de comprobante (factura / remito / tique)
--
-- El alta de compra (registrar_compra, 0010) pasa a pedir que se elija
-- primero el tipo de comprobante del proveedor. Una factura o un tique
-- traen precio por linea; un remito solo trae cantidad y no tiene costo
-- unitario (linea_compra.lc_costo_unitario ya era nullable desde 0003,
-- asi que no hace falta tocar esa tabla).
--
-- Idempotente: columnas con "if not exists", el enum con el do-block que
-- traga duplicate_object, y la funcion se dropea antes de recrearse
-- porque cambia la lista de parametros (no es un "create or replace"
-- valido sobre la firma vieja de 0010).
-- =====================================================================

do $$
begin
  create type comprobante_tipo_t as enum ('factura', 'remito', 'tique');
exception
  when duplicate_object then null;
end $$;

alter table compras add column if not exists co_tipo_comprobante comprobante_tipo_t;
update compras set co_tipo_comprobante = 'factura' where co_tipo_comprobante is null;
alter table compras alter column co_tipo_comprobante set default 'factura';
alter table compras alter column co_tipo_comprobante set not null;

alter table compras add column if not exists co_punto_venta varchar(10);

-- =====================================================================
-- registrar_compra — misma transaccion atomica de 0010 (compra + lineas
-- + incremento de stock), ahora con tipo de comprobante y punto de
-- venta. co_nombre pasa a guardar el numero de comprobante (antes era
-- una referencia libre; la UI ya no expone ese campo por separado).
-- =====================================================================
drop function if exists registrar_compra(int, text, date, text, jsonb, int);

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

grant execute on function registrar_compra(int, text, date, text, jsonb, int, text, text) to authenticated;
