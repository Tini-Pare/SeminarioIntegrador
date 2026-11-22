-- =====================================================================
-- External stock movements (ingresos/egresos externos)
--
-- Until now repuestos.rep_cantidad_actual only moved through compras
-- (registrar_compra / remitos, 0010-0013-0026) and tareas
-- (finalizar_tarea, 0021). This adds a third, manual path for what
-- happens outside those flows: a lost or broken repuesto (egreso), or
-- one bought without going through Compras (ingreso).
--
-- Every movement is a row in movimiento_stock, so each unit added or
-- removed still traces back to a record (who, when, why) — the same
-- guarantee compras and tareas give. Rows are never edited or deleted:
-- a wrong movement is corrected with an opposite one.
--
-- Stock only changes through registrar_movimiento_stock (security
-- definer, admin only), which inserts the row and moves the stock in
-- the same transaction.
--
-- Notifications: the stock_bajo/sin_stock trigger (0040) still fires,
-- but a crossing caused by hand — an external movement, or an admin
-- raising a repuesto's mínimo — no longer notifies the admin who did it
-- (they already know). Every other active admin still gets it, so the
-- crossing isn't lost for them. Stock consumed by tareas keeps
-- notifying every admin, as before.
--
-- Idempotent: create table if not exists, policies drop-then-create,
-- function create or replace.
-- =====================================================================

create table if not exists movimiento_stock (
  ms_id                int generated always as identity primary key,
  rep_id               int not null references repuestos(rep_id),
  ms_tipo              varchar(10) not null check (ms_tipo in ('ingreso', 'egreso')),
  ms_cantidad          int not null check (ms_cantidad > 0),
  ms_motivo            varchar(100) not null check (length(trim(ms_motivo)) > 0),
  -- The reason's detail; the app only sends it for "Otro".
  ms_comentario        varchar(255),
  ms_p_id_registrador  uuid references profiles(id),
  ms_creado_en         timestamptz not null default now()
);

create index if not exists movimiento_stock_rep_id_idx on movimiento_stock (rep_id);

grant select on movimiento_stock to authenticated;

alter table movimiento_stock enable row level security;

-- Same scope as compras/remito_compra: admin only. There's no insert
-- policy on purpose — the RPC below is the only way in.
drop policy if exists "movimiento_stock: admin read" on movimiento_stock;
create policy "movimiento_stock: admin read" on movimiento_stock
  for select using (current_role_name() = 'admin');

-- =====================================================================
-- registrar_movimiento_stock — records an external ingreso/egreso and
-- applies it to the repuesto's stock. Returns the new ms_id.
--
-- An egreso larger than the stock on hand is rejected with a readable
-- message (instead of letting the rep_cantidad_actual >= 0 check fail).
-- The repuesto row is locked first so two concurrent egresos can't both
-- pass that check.
-- =====================================================================
create or replace function registrar_movimiento_stock(
  p_rep_id      int,
  p_tipo        text,
  p_cantidad    int,
  p_motivo      text,
  p_comentario  text default null
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_stock   int;
  v_ms_id   int;
begin
  if current_role_name() <> 'admin' then
    raise exception 'Solo un administrador puede registrar ingresos o egresos de stock'
      using errcode = 'insufficient_privilege';
  end if;

  if p_tipo is null or p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Tipo de movimiento inválido';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad tiene que ser mayor a 0';
  end if;

  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Indicá el motivo del movimiento';
  end if;

  select rep_cantidad_actual into v_stock
    from repuestos
    where rep_id = p_rep_id
    for update;

  if not found then
    raise exception 'El repuesto % no existe', p_rep_id;
  end if;

  if p_tipo = 'egreso' and p_cantidad > v_stock then
    raise exception 'No hay stock suficiente: hay % y se quieren sacar %', v_stock, p_cantidad;
  end if;

  insert into movimiento_stock (
    rep_id, ms_tipo, ms_cantidad, ms_motivo, ms_comentario, ms_p_id_registrador
  ) values (
    p_rep_id, p_tipo, p_cantidad, trim(p_motivo), nullif(trim(p_comentario), ''), auth.uid()
  )
  returning ms_id into v_ms_id;

  -- Tells notificar_stock_minimo (below) this change was made by hand.
  -- is_local = true: it only lasts until this transaction ends, so it
  -- can't leak into a later request on the same pooled connection.
  perform set_config('app.origen_stock', 'movimiento_externo', true);

  update repuestos
    set rep_cantidad_actual = rep_cantidad_actual
      + case when p_tipo = 'ingreso' then p_cantidad else -p_cantidad end
    where rep_id = p_rep_id;

  return v_ms_id;
end;
$$;

grant execute on function registrar_movimiento_stock(int, text, int, text, text) to authenticated;

-- =====================================================================
-- notificar_stock_minimo — same crossings as 0040, but skips the admin
-- who caused a crossing by hand:
--   * an external movement (registrar_movimiento_stock flags the
--     transaction with app.origen_stock), or
--   * a mínimo edited in this same update (only admins can edit
--     repuestos, see 0010; raising it is what crosses the threshold).
-- Everyone else is notified as before. finalizar_tarea sets no flag and
-- never touches the mínimo, so tareas still notify every admin.
--
-- Inserts directly instead of going through notificar_admins, whose
-- signature the other notification triggers (0040/0045) share.
-- "is distinct from" keeps everyone when there's no one to skip
-- (v_excluir null), where "<>" would drop every row.
-- =====================================================================
create or replace function notificar_stock_minimo() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_tipo     varchar;
  v_excluir  uuid;
begin
  if new.rep_estado <> 'activo' then
    return new;
  end if;

  if new.rep_cantidad_actual <= 0 and old.rep_cantidad_actual > 0 then
    v_tipo := 'sin_stock';
  elsif new.rep_cantidad_actual <= new.rep_stock_minimo
        and old.rep_cantidad_actual > old.rep_stock_minimo then
    v_tipo := 'stock_bajo';
  else
    return new;
  end if;

  if current_setting('app.origen_stock', true) = 'movimiento_externo'
     or new.rep_stock_minimo is distinct from old.rep_stock_minimo then
    v_excluir := auth.uid();
  end if;

  insert into notificacion (user_id, no_tipo, rep_id, no_cantidad, no_minimo)
  select p.id, v_tipo, new.rep_id, new.rep_cantidad_actual, new.rep_stock_minimo
    from profiles p
    where p.role = 'admin'
      and p.active
      and p.id is distinct from v_excluir;

  return new;
end;
$$;
