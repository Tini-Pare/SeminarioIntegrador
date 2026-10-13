-- =====================================================================
-- Remove everything related to garantía (warranty)
--
-- Warranty is no longer part of the system: it was already dropped from
-- the purchase form (profes' review), and now also from the equipo
-- (detail screen and create/edit forms). This drops what was left in the
-- database:
--   - equipo.eq_fecha_garantia
--   - compras.co_garantia
--   - registrar_compra's p_co_garantia parameter (the app sent it null)
--
-- WARNING: dropping the columns discards any warranty data already loaded.
-- Run it together with the app version that no longer sends
-- p_co_garantia: the old app calling the new function (or the other way
-- around) fails to register purchases, since PostgREST matches the
-- function by parameter names.
--
-- Must run AFTER 0026_compras_factura_con_remito: registrar_compra is
-- dropped and recreated because its signature changes, and the body is
-- 0026's (with p_con_remito) minus the co_garantia insert. Both older
-- signatures are dropped so no overload is left behind whichever one the
-- database has.
-- =====================================================================

-- 0025's signature (9 params) and 0026's (10 params, adds p_con_remito).
drop function if exists registrar_compra(int, text, date, text, jsonb, int, text, text, text);
drop function if exists registrar_compra(int, text, date, text, jsonb, int, text, text, text, boolean);

alter table equipo drop column if exists eq_fecha_garantia;
alter table compras drop column if exists co_garantia;

create or replace function registrar_compra(
  p_prov_id_proveedor    int,
  p_co_nombre            text,
  p_co_fecha_compra      date,
  p_lineas               jsonb,
  p_ped_id_ped_compra    int default null,
  p_co_tipo_comprobante  text default 'factura',
  p_co_punto_venta       text default null,
  p_co_letra             text default null,
  p_con_remito           boolean default false
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
    prov_id_proveedor, co_nombre, co_fecha_compra,
    co_costo_total, co_p_id_registrador, co_tipo_comprobante, co_punto_venta,
    co_letra
  )
  values (
    p_prov_id_proveedor,
    nullif(btrim(p_co_nombre), ''),
    coalesce(p_co_fecha_compra, current_date),
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
      -- Doesn't move stock yet (see 0013) — only checks the repuesto
      -- exists, so a dangling rep_id isn't found only when the first
      -- remito arrives.
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

  -- The factura arrived with its remito (0026): load that remito for
  -- everything invoiced. Goes after linking the pedido so
  -- registrar_remito_compra finds it and flips it to 'recibido'. Factura
  -- only: tique and remito already added stock above.
  if p_con_remito and p_co_tipo_comprobante = 'factura' then
    perform registrar_remito_compra(
      v_co_id,
      coalesce(p_co_fecha_compra, current_date),
      (
        select jsonb_agg(jsonb_build_object('rep_id', rep_id, 'cantidad', lc_cantidad)
                         order by lc_nro_linea)
        from linea_compra
        where co_id_compra = v_co_id
      )
    );
  end if;

  return v_co_id;
end;
$$;

grant execute on function registrar_compra(int, text, date, jsonb, int, text, text, text, boolean) to authenticated;
