-- =====================================================================
-- Compras — letra de la factura (A / B / C)
--
-- Correccion de los profes: al registrar una factura se tiene que poder
-- elegir si es A, B o C (hasta ahora la UI solo mostraba "C"), y la letra
-- tiene que verse en la grilla de compras ("Factura A 0001-00024352").
--
-- co_letra solo tiene sentido para una factura: un tique o un remito no
-- llevan letra. El check lo deja atado al tipo en los dos sentidos —
-- toda factura tiene letra, nada que no sea factura la tiene.
--
-- Las facturas ya cargadas se completan con 'C': era la unica letra que
-- ofrecia el formulario (tarjeta "C · Cod. 11" del paso 1), asi que es la
-- que el admin vio al cargarlas.
--
-- registrar_compra se dropea y se recrea porque suma un parametro
-- (p_co_letra); con create or replace quedarian dos sobrecargas. El
-- cuerpo es el de 0013 sin cambios salvo la validacion e insercion de la
-- letra.
-- =====================================================================

alter table compras add column if not exists co_letra char(1);

update compras set co_letra = 'C'
  where co_tipo_comprobante = 'factura' and co_letra is null;

alter table compras drop constraint if exists compras_letra_chk;
alter table compras add constraint compras_letra_chk check (
  (co_tipo_comprobante = 'factura' and co_letra in ('A', 'B', 'C'))
  or (co_tipo_comprobante <> 'factura' and co_letra is null)
);

drop function if exists registrar_compra(int, text, date, text, jsonb, int, text, text);

create or replace function registrar_compra(
  p_prov_id_proveedor    int,
  p_co_nombre            text,
  p_co_fecha_compra      date,
  p_co_garantia          text,
  p_lineas               jsonb,
  p_ped_id_ped_compra    int default null,
  p_co_tipo_comprobante  text default 'factura',
  p_co_punto_venta       text default null,
  p_co_letra             text default null
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
  v_letra       char(1);
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede registrar compras'
      using errcode = 'insufficient_privilege';
  end if;

  if p_co_tipo_comprobante not in ('factura', 'remito', 'tique') then
    raise exception 'Tipo de comprobante invalido: %', p_co_tipo_comprobante;
  end if;

  if p_co_tipo_comprobante = 'factura' then
    v_letra := upper(btrim(p_co_letra));
    if v_letra is null or v_letra not in ('A', 'B', 'C') then
      raise exception 'Elegi la letra de la factura (A, B o C)';
    end if;
  else
    v_letra := null;
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La compra necesita al menos una linea de repuesto';
  end if;

  insert into compras (
    prov_id_proveedor, co_nombre, co_fecha_compra, co_garantia,
    co_costo_total, co_p_id_registrador, co_tipo_comprobante, co_punto_venta,
    co_letra
  )
  values (
    p_prov_id_proveedor,
    nullif(btrim(p_co_nombre), ''),
    coalesce(p_co_fecha_compra, current_date),
    nullif(btrim(p_co_garantia), ''),
    0,
    auth.uid(),
    p_co_tipo_comprobante::comprobante_tipo_t,
    nullif(btrim(p_co_punto_venta), ''),
    v_letra
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
      -- No mueve stock todavia (ver 0013) — solo valida que el repuesto
      -- exista, para no descubrir un rep_id colgado recien cuando llegue
      -- el primer remito.
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

grant execute on function registrar_compra(int, text, date, text, jsonb, int, text, text, text) to authenticated;
