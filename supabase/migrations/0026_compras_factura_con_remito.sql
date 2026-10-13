-- =====================================================================
-- Compras — registrar una factura que llego junto con su remito
--
-- Correccion de los profes: muchas veces la factura y el remito llegan
-- juntos. Hasta ahora eso obligaba a registrar la factura y despues
-- volver a Compras solo para cargar el remito. Ahora, al registrar una
-- factura, el admin indica "¿Llego con remito?" Si / No:
--
--   * No: igual que antes. La factura no mueve stock y los remitos se
--     cargan despues desde el detalle (ver 0013).
--   * Si: en la misma transaccion se carga un remito por la cantidad
--     completa de cada linea, con la fecha de la factura. El stock entra
--     y la compra queda Recibida. Es un remito como cualquier otro: se ve,
--     se edita y se anula desde el detalle.
--
-- registrar_compra se dropea y se recrea porque suma un parametro
-- (p_con_remito); con create or replace quedarian dos sobrecargas. El
-- cuerpo es el de 0025 sin cambios salvo el bloque final de p_con_remito,
-- que reutiliza registrar_remito_compra (0013) para no duplicar su
-- validacion ni la suma de stock.
--
-- Limpieza: una version anterior de esta migracion (nunca commiteada, pero
-- corrida en la base compartida) agrego "recibir factura sin remito":
-- columna compras.co_sin_remito, funcion recibir_factura_sin_remito y el
-- trigger remito_compra_sin_remito. Se reemplazo por este enfoque, asi que
-- se quitan. Una factura que ya se haya recibido por ese camino tiene el
-- stock sumado pero ningun remito: se le genera el remito equivalente (sin
-- tocar stock) para que siga leyendose como Recibida.
--
-- Idempotente: drops con "if exists", la conversion solo corre mientras
-- exista la columna vieja, funcion con create or replace. Correr en el
-- SQL Editor despues de 0025.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Limpieza de "recibir factura sin remito"
-- ---------------------------------------------------------------------

-- The trigger goes first: it would refuse the remito inserts below.
drop trigger if exists remito_compra_sin_remito on remito_compra;
drop function if exists trg_remito_compra_sin_remito();
drop function if exists recibir_factura_sin_remito(int);

do $$
declare
  v_co     record;
  v_rc_id  int;
begin
  -- On a database that never ran the old version there's nothing to convert
  -- (and the column can't be referenced statically, hence the execute).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'compras' and column_name = 'co_sin_remito'
  ) then
    return;
  end if;

  for v_co in execute
    'select co_id_compra, co_fecha_compra, co_p_id_registrador from compras where co_sin_remito'
  loop
    -- Stock already entered when it was received without remito, so this
    -- only records that reception as a remito; repuestos is not touched.
    insert into remito_compra (co_id_compra, rc_fecha, rc_p_id_registrador)
    values (v_co.co_id_compra, coalesce(v_co.co_fecha_compra, current_date), v_co.co_p_id_registrador)
    returning rc_id into v_rc_id;

    insert into remito_compra_linea (rc_id, co_id_compra, rep_id, rcl_cantidad)
    select v_rc_id, lc.co_id_compra, lc.rep_id, lc.lc_cantidad
      from linea_compra lc
      where lc.co_id_compra = v_co.co_id_compra and coalesce(lc.lc_cantidad, 0) > 0;
  end loop;
end;
$$;

alter table compras drop column if exists co_sin_remito;

-- ---------------------------------------------------------------------
-- registrar_compra con p_con_remito
-- ---------------------------------------------------------------------

drop function if exists registrar_compra(int, text, date, text, jsonb, int, text, text, text);

create or replace function registrar_compra(
  p_prov_id_proveedor    int,
  p_co_nombre            text,
  p_co_fecha_compra      date,
  p_co_garantia          text,
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

  -- La factura llego con su remito: se carga ese remito por todo lo
  -- facturado. Va despues de enlazar el pedido para que
  -- registrar_remito_compra lo encuentre y lo pase a 'recibido'. Solo
  -- aplica a una factura: tique y remito ya sumaron stock arriba.
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

grant execute on function registrar_compra(int, text, date, text, jsonb, int, text, text, text, boolean) to authenticated;
