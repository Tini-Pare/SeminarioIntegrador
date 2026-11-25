-- =====================================================================
-- Demo reset + sample data
--
-- Empties every table and loads a consistent demo of the whole system,
-- with ~6 months of history ending today (every date is relative to
-- current_date, so the demo looks fresh whenever it's run).
--
-- Run it whole in the Supabase SQL Editor, after every migration up to
-- 0051. It's a single transaction: if anything fails, nothing changes.
-- It can be run again any time to get back to the same starting point.
--
-- What it does:
--   1. Reset: truncates every public table except profiles, then deletes
--      every non-admin account (auth user + profile). Admin accounts are
--      kept, so whoever runs it can still log in.
--   2. Demo accounts (password Demo1234 for all of them):
--        9000  Laura Méndez      admin
--        9101  Martín Gómez      técnico   (the one with the fullest queue)
--        9102  Sofía Ramírez     técnico
--        9103  Diego Fernández   técnico
--        9104  Lucía Benítez     técnico
--        9105  Carlos Medina     técnico, inactive
--        9201  Ana Torres        usuario (salón de ventas)
--        9202  Jorge Pereyra     usuario (carnicería y fiambrería)
--        9203  Valeria Suárez    usuario (panadería)
--        9204  Roberto Díaz      usuario (depósito y cámaras)
--        9205  Camila Ortiz      usuario (línea de cajas)
--        9206  Pablo Rossi       usuario, inactive
--   3. Catalogs: lugares, tipos de equipo, equipos (one pending
--      installation, two dados de baja), tareas genéricas, fallas
--      genéricas, repuestos (some under their mínimo, one out of stock,
--      some idle), rubros and proveedores, planes de mantenimiento (one
--      inactive).
--   4. History: preventive OTs generated cycle by cycle from each plan
--      (some late), correctivas from solicitudes (some rejected, some with
--      suspended tareas and repuestos used), installation OTs, the whole
--      historial of each equipo, pedidos de compra in every state, compras
--      with every comprobante type (received, pending, partially
--      received), remitos and stock movements.
--   5. Current state to show live: pending solicitudes, a critical OT not
--      started yet, OTs in progress, a suspended tarea waiting for a
--      pedido, overdue OTs (correctivas and preventivas), an OT without
--      tareas, an equipo waiting for its installation and unread
--      notifications for admins and técnicos.
--
-- Triggers that derive state (OT estado, end dates, historial,
-- notificaciones, stock) are disabled while loading and re-enabled at the
-- end: historical rows need their real past dates, and the triggers would
-- stamp today on them. The derived state is written here instead, the
-- same way the triggers would have, and each equipo's estado is
-- recalculated with sync_equipo_estado at the end.
--
-- If the auth.users inserts are refused (permissions on the auth schema),
-- create the demo accounts from the app (Usuarios -> Invitar persona) with
-- the legajos above, and run this again without section 2.
-- =====================================================================

begin;

set local timezone = 'America/Argentina/Buenos_Aires';
set local search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. Reset
-- ---------------------------------------------------------------------
do $$
declare
  v_tables text;
begin
  select string_agg(format('public.%I', tablename), ', ' order by tablename)
    into v_tables
    from pg_tables
    where schemaname = 'public' and tablename <> 'profiles';

  execute 'truncate table ' || v_tables || ' restart identity cascade';
end;
$$;

-- Every non-admin account goes, and the demo ones are recreated below.
-- Deleting the auth user cascades to its profile.
delete from auth.users
  where id in (
    select id from profiles
    where role <> 'admin'
       or legajo in ('9000', '9101', '9102', '9103', '9104', '9105',
                     '9201', '9202', '9203', '9204', '9205', '9206')
  );

-- ---------------------------------------------------------------------
-- 2. Demo accounts. Same shape the invite-user Edge Function creates:
--    synthetic email <legajo>@legajo.mantia.internal, confirmed.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_email text;
begin
  for r in
    select * from (values
      ('00000000-0000-4000-8000-000000009000'::uuid, '9000', 'Laura Méndez',    'admin'::role_t,      true),
      ('00000000-0000-4000-8000-000000009101'::uuid, '9101', 'Martín Gómez',    'technician'::role_t, true),
      ('00000000-0000-4000-8000-000000009102'::uuid, '9102', 'Sofía Ramírez',   'technician'::role_t, true),
      ('00000000-0000-4000-8000-000000009103'::uuid, '9103', 'Diego Fernández', 'technician'::role_t, true),
      ('00000000-0000-4000-8000-000000009104'::uuid, '9104', 'Lucía Benítez',   'technician'::role_t, true),
      ('00000000-0000-4000-8000-000000009105'::uuid, '9105', 'Carlos Medina',   'technician'::role_t, false),
      ('00000000-0000-4000-8000-000000009201'::uuid, '9201', 'Ana Torres',      'user'::role_t,       true),
      ('00000000-0000-4000-8000-000000009202'::uuid, '9202', 'Jorge Pereyra',   'user'::role_t,       true),
      ('00000000-0000-4000-8000-000000009203'::uuid, '9203', 'Valeria Suárez',  'user'::role_t,       true),
      ('00000000-0000-4000-8000-000000009204'::uuid, '9204', 'Roberto Díaz',    'user'::role_t,       true),
      ('00000000-0000-4000-8000-000000009205'::uuid, '9205', 'Camila Ortiz',    'user'::role_t,       true),
      ('00000000-0000-4000-8000-000000009206'::uuid, '9206', 'Pablo Rossi',     'user'::role_t,       false)
    ) as u(id, legajo, nombre, rol, activo)
  loop
    v_email := r.legajo || '@legajo.mantia.internal';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
      v_email, crypt('Demo1234', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now() - interval '240 days', now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), r.id, r.id::text,
      jsonb_build_object('sub', r.id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now() - interval '240 days', now()
    );

    insert into profiles (id, name, email, legajo, role, active, created_at)
    values (r.id, r.nombre, v_email, r.legajo, r.rol, r.activo, now() - interval '240 days');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers off while loading (FK checks stay on: they're internal
--    triggers, untouched by "disable trigger user")
-- ---------------------------------------------------------------------
alter table orden_de_trabajo disable trigger user;
alter table tareas_realizadas_orden disable trigger user;
alter table solicitudes disable trigger user;
alter table repuestos disable trigger user;
alter table tareas_generales disable trigger user;
alter table tarea_prevista_plan disable trigger user;
alter table equipo disable trigger user;
alter table notificacion disable trigger user;

-- ---------------------------------------------------------------------
-- 4. Catalogs
-- ---------------------------------------------------------------------
insert into lugares (lu_codigo, lu_nombre_sector, lu_piso) overriding system value values
  (1,  'Salón de ventas',          'PB'),
  (2,  'Carnicería',               'PB'),
  (3,  'Panadería',                'PB'),
  (4,  'Fiambrería y lácteos',     'PB'),
  (5,  'Depósito central',         'PB'),
  (6,  'Cámaras frigoríficas',     'PB'),
  (7,  'Línea de cajas',           'PB'),
  (8,  'Oficinas administrativas', '1° piso'),
  (9,  'Sala de máquinas',         'Subsuelo'),
  (10, 'Estacionamiento',          'Subsuelo');

insert into tipos_de_equipos (te_id, te_nombre) overriding system value values
  (1,  'Heladera exhibidora'),
  (2,  'Cámara frigorífica'),
  (3,  'Horno de panadería'),
  (4,  'Aire acondicionado'),
  (5,  'Balanza electrónica'),
  (6,  'Cortadora de fiambre'),
  (7,  'Caja registradora (POS)'),
  (8,  'Grupo electrógeno'),
  (9,  'Freezer horizontal'),
  (10, 'Autoelevador');

-- eq_fecha_instalacion is days before today; HEL-006's real date is set
-- by the preventive generation below (it joined its plan when installed).
insert into equipo (
  eq_id_equipo, te_id, lu_codigo, eq_codigo, eq_nombre, eq_modelo,
  eq_fecha_instalacion, eq_estado_registro, eq_pendiente_instalacion
) overriding system value
select id, te, lu, codigo, nombre, modelo,
       case when dias is not null then current_date - dias end,
       estado, pendiente
from (values
  (1,  1,  4, 'HEL-001', 'Heladera exhibidora de lácteos 1',     'Polarline EX-2400',    900,  'activo',   false),
  (2,  1,  4, 'HEL-002', 'Heladera exhibidora de lácteos 2',     'Polarline EX-2400',    900,  'activo',   false),
  (3,  1,  1, 'HEL-003', 'Heladera exhibidora de bebidas',       'Polarline Vision 3P',  700,  'activo',   false),
  (4,  1,  2, 'HEL-004', 'Heladera exhibidora de carnes',        'FrioTec MC-180',       650,  'activo',   false),
  (5,  1,  4, 'HEL-005', 'Heladera exhibidora de fiambres',      'FrioTec MF-150',       500,  'activo',   false),
  (6,  1,  7, 'HEL-006', 'Heladera vertical de línea de cajas',  'Polarline V-600',      60,   'activo',   false),
  (7,  1,  1, 'HEL-007', 'Heladera exhibidora de congelados',    'Polarline Vision 4P',  null, 'activo',   true),
  (8,  2,  6, 'CAM-001', 'Cámara frigorífica de carnes',         'TecnoFrío CF-12',      1500, 'activo',   false),
  (9,  2,  6, 'CAM-002', 'Cámara frigorífica de lácteos',        'TecnoFrío CF-8',       1200, 'activo',   false),
  (10, 2,  6, 'CAM-003', 'Cámara de congelados',                 'TecnoFrío CC-10',      1000, 'activo',   false),
  (11, 3,  3, 'HOR-001', 'Horno rotativo de panadería',          'Panifor HR-18',        800,  'activo',   false),
  (12, 3,  3, 'HOR-002', 'Horno de convección',                  'Panifor HC-10',        400,  'activo',   false),
  (13, 4,  1, 'AIR-001', 'Aire acondicionado salón norte',       'Climar RT-15',         1100, 'activo',   false),
  (14, 4,  1, 'AIR-002', 'Aire acondicionado salón sur',         'Climar RT-15',         1100, 'activo',   false),
  (15, 4,  8, 'AIR-003', 'Aire acondicionado de oficinas',       'Climar Split 3000',    600,  'activo',   false),
  (16, 4,  7, 'AIR-004', 'Aire acondicionado de línea de cajas', 'Climar Split 6000',    600,  'activo',   false),
  (17, 5,  2, 'BAL-001', 'Balanza de carnicería',                'Pesatec PT-31',        500,  'activo',   false),
  (18, 5,  4, 'BAL-002', 'Balanza de fiambrería',                'Pesatec PT-31',        500,  'activo',   false),
  (19, 5,  3, 'BAL-003', 'Balanza de panadería',                 'Pesatec PT-15',        300,  'activo',   false),
  (20, 5,  1, 'BAL-004', 'Balanza de verdulería',                'Pesatec PT-15',        300,  'activo',   false),
  (21, 6,  4, 'COR-001', 'Cortadora de fiambre 1',               'Cortex 300',           700,  'activo',   false),
  (22, 6,  4, 'COR-002', 'Cortadora de fiambre 2',               'Cortex 300',           700,  'activo',   false),
  (23, 7,  7, 'POS-001', 'Caja 1',                               'PuntoVenta T-200',     400,  'activo',   false),
  (24, 7,  7, 'POS-002', 'Caja 2',                               'PuntoVenta T-200',     400,  'activo',   false),
  (25, 7,  7, 'POS-003', 'Caja 3',                               'PuntoVenta T-200',     400,  'activo',   false),
  (26, 7,  7, 'POS-004', 'Caja 4 (autoservicio)',                'PuntoVenta AS-10',     250,  'activo',   false),
  (27, 7,  7, 'POS-005', 'Caja 5',                               'PuntoVenta T-100',     1500, 'inactivo', false),
  (28, 8,  9, 'GEN-001', 'Grupo electrógeno principal',          'Generatec GE-110 kVA', 1300, 'activo',   false),
  (29, 9,  1, 'FRZ-001', 'Freezer horizontal de helados',        'Glaciar FH-500',       450,  'activo',   false),
  (30, 9,  1, 'FRZ-002', 'Freezer horizontal de congelados',     'Glaciar FH-700',       450,  'activo',   false),
  (31, 9,  5, 'FRZ-003', 'Freezer de depósito',                  'Glaciar FH-400',       1600, 'inactivo', false),
  (32, 10, 5, 'AUT-001', 'Autoelevador eléctrico',               'Elevamax E-15',        900,  'activo',   false)
) as e(id, te, lu, codigo, nombre, modelo, dias, estado, pendiente);

-- Tarea 1 is the system one (0032): the installation OTs rely on it.
insert into tareas_generales (
  tag_id_tarea, tag_nombre_tarea, tag_descripcion_tarea, tag_estado, tag_codigo_sistema
) overriding system value values
  (1,  'Instalación de equipo', 'Instalación y puesta en marcha de un equipo nuevo. Al finalizarla se registra la fecha de instalación y el equipo se incorpora a los planes de mantenimiento de su tipo.', 'activo', 'instalacion'),
  (2,  'Limpieza de condensador',              'Limpieza del condensador y las aletas con aire comprimido y cepillo.',               'activo',   null),
  (3,  'Control de temperatura y termostato',  'Medición de la temperatura de trabajo y ajuste del termostato.',                    'activo',   null),
  (4,  'Revisión de burletes',                 'Control del cierre de puertas y del estado de los burletes.',                       'activo',   null),
  (5,  'Control de presión y carga de gas',    'Medición de presiones del circuito y recarga de gas refrigerante si hace falta.',    'activo',   null),
  (6,  'Revisión eléctrica general',           'Revisión de tablero, conexiones, protecciones y consumo.',                          'activo',   null),
  (7,  'Limpieza de quemadores y conductos',   'Limpieza de quemadores, conductos y cámara de cocción.',                            'activo',   null),
  (8,  'Limpieza de filtros',                  'Limpieza o reemplazo de los filtros de aire.',                                      'activo',   null),
  (9,  'Calibración de balanza',               'Calibración con pesas patrón y verificación de la tara.',                           'activo',   null),
  (10, 'Afilado de cuchilla',                  'Afilado de la cuchilla y ajuste del plato.',                                        'activo',   null),
  (11, 'Lubricación de partes móviles',        'Lubricación de ejes, guías y rodamientos con aceite de grado alimenticio.',         'activo',   null),
  (12, 'Prueba de carga del grupo electrógeno','Arranque y prueba con carga durante 30 minutos.',                                   'activo',   null),
  (13, 'Cambio de aceite y filtros',           'Cambio de aceite del motor, filtro de aceite y filtro de combustible.',             'activo',   null),
  (14, 'Limpieza y revisión de periféricos',   'Limpieza de impresora, lector y teclado de la caja.',                               'activo',   null),
  (15, 'Diagnóstico de falla',                 'Revisión del equipo para encontrar la causa de la falla.',                          'activo',   null),
  (16, 'Reemplazo de compresor',               'Reemplazo del compresor, vacío y carga de gas.',                                    'activo',   null),
  (17, 'Cambio de resistencia',                'Reemplazo de la resistencia y prueba de temperatura.',                              'activo',   null),
  (18, 'Reemplazo de ventilador',              'Reemplazo del ventilador del condensador o del evaporador.',                        'activo',   null),
  (19, 'Cambio de burletes',                   'Reemplazo de burletes de puertas o tapas.',                                         'activo',   null),
  (20, 'Reparación de tablero eléctrico',      'Reparación de cableado, borneras y protecciones del tablero.',                      'activo',   null),
  (21, 'Actualización de software POS',        'Actualización del software del punto de venta y prueba de periféricos.',           'activo',   null),
  (22, 'Reparación de pérdida de agua',        'Destapado del desagote y reparación de mangueras.',                                 'activo',   null),
  (23, 'Pintura de gabinete',                  'Lijado y pintura del gabinete exterior.',                                           'inactivo', null),
  (24, 'Revisión de batería y cargador',       'Control de la batería, el cargador y sus conectores.',                              'activo',   null);

insert into fallo (fa_id_fallo, fa_nombre, fa_desperfecto, fa_gravedad, fa_estado) overriding system value values
  (1,  'Falta de frío',                    'El equipo no alcanza su temperatura de trabajo.',             'high',   'activo'),
  (2,  'Pérdida de gas refrigerante',      'Pérdida en el circuito de refrigeración.',                   'high',   'activo'),
  (3,  'Compresor no arranca',             'El compresor no enciende o se corta al arrancar.',           'high',   'activo'),
  (4,  'Falla eléctrica',                  'Corte, cortocircuito o protección que salta.',               'high',   'activo'),
  (5,  'Ruido anormal',                    'Ruidos o vibraciones fuera de lo normal.',                   'medium', 'activo'),
  (6,  'Termostato descalibrado',          'La temperatura oscila o no respeta la programada.',          'medium', 'activo'),
  (7,  'Resistencia quemada',              'El equipo no calienta o calienta parcialmente.',             'medium', 'activo'),
  (8,  'Balanza descalibrada',             'La balanza no marca el peso correcto.',                      'medium', 'activo'),
  (9,  'Pantalla o teclado no responde',   'Falla de pantalla, teclado o software.',                     'medium', 'activo'),
  (10, 'Burlete dañado',                   'Las puertas o tapas no cierran herméticamente.',             'low',    'activo'),
  (11, 'Pérdida de agua',                  'Goteo o agua acumulada debajo del equipo.',                  'low',    'activo'),
  (12, 'Filtro obstruido',                 'Filtros sucios que reducen el rendimiento.',                 'low',    'activo'),
  (13, 'Cuchilla desafilada',              'La cortadora no corta parejo.',                              'low',    'activo'),
  (14, 'Iluminación quemada',              'Lámparas o tubos del equipo apagados.',                      'low',    'activo'),
  (15, 'Vidrio empañado',                  'Condensación en el vidrio de la puerta.',                    'low',    'inactivo');

-- Final stock, already net of every compra, consumo and movimiento below.
insert into repuestos (
  rep_id, rep_nombre, rep_cantidad_actual, rep_stock_minimo, rep_stock_maximo, rep_estado, rep_unidad
) overriding system value values
  (1,  'Gas refrigerante R404A',               6,  4, 25,   'activo',   'kilogramo'),
  (2,  'Gas refrigerante R134a',               1,  3, 15,   'activo',   'kilogramo'),
  (3,  'Burlete para heladera',                18, 10, 40,  'activo',   'metro'),
  (4,  'Compresor 1/2 HP',                     1,  1, 3,    'activo',   'unidad'),
  (5,  'Termostato digital',                   4,  2, 8,    'activo',   'unidad'),
  (6,  'Filtro de aire acondicionado',         0,  4, 16,   'activo',   'unidad'),
  (7,  'Ventilador de condensador',            2,  2, 6,    'activo',   'unidad'),
  (8,  'Resistencia para horno 3000 W',        2,  1, 4,    'activo',   'unidad'),
  (9,  'Aceite lubricante grado alimenticio',  6,  3, 12,   'activo',   'litro'),
  (10, 'Cuchilla para cortadora 300 mm',       2,  1, 3,    'activo',   'unidad'),
  (11, 'Fusibles 10 A',                        9,  3, 15,   'activo',   'caja'),
  (12, 'Cable unipolar 2,5 mm',                3,  1, 6,    'activo',   'rollo'),
  (13, 'Aceite de motor 15W40',                14, 5, 30,   'activo',   'litro'),
  (14, 'Filtro de aceite para grupo electrógeno', 3, 1, 6,  'activo',   'unidad'),
  (15, 'Papel térmico para caja',              7,  4, 20,   'activo',   'caja'),
  (16, 'Guantes de seguridad',                 15, 6, 40,   'activo',   'par'),
  (17, 'Membrana de teclado para balanza',     1,  1, 4,    'activo',   'unidad'),
  (18, 'Correa de transmisión',                4,  2, 6,    'activo',   'unidad'),
  (19, 'Batería 12 V para grupo electrógeno',  1,  1, 2,    'activo',   'unidad'),
  (20, 'Lámpara LED para exhibidora',          6,  4, 20,   'activo',   'unidad'),
  (21, 'Tubo fluorescente 36 W',               3,  0, null, 'inactivo', 'unidad'),
  (22, 'Kit de juntas para cámara',            2,  1, 4,    'activo',   'unidad');

insert into tipos_proveedores (tp_id, tp_nombre_rubro, tp_descripcion) overriding system value values
  (1, 'Refrigeración',            'Gas, compresores y repuestos de frío.'),
  (2, 'Electricidad',             'Materiales eléctricos y baterías.'),
  (3, 'Ferretería industrial',    'Filtros, lubricantes y elementos de seguridad.'),
  (4, 'Insumos de punto de venta','Papel térmico y repuestos de cajas y balanzas.'),
  (5, 'Equipamiento gastronómico','Hornos y repuestos de panadería.'),
  (6, 'Lubricantes',              'Aceites y filtros para motores.');

insert into proveedores (
  prov_id_proveedor, tp_id, prov_nombre, prov_telefono, prov_correo, prov_cuit
) overriding system value values
  (1, 1, 'FríoSur Refrigeración SRL',        '011 4567-1200', 'ventas@friosur.com.ar',        '30-71234567-1'),
  (2, 2, 'Electro Mayorista Norte',          '011 4890-3344', 'pedidos@electronorte.com.ar',  '30-70987654-2'),
  (3, 3, 'Ferretería Industrial Delta',      '011 4711-5566', 'contacto@ferredelta.com.ar',   '30-71555888-9'),
  (4, 4, 'Insumos POS Argentina',            '011 5263-7788', 'comercial@insumospos.com.ar',  '30-71444222-4'),
  (5, 5, 'Hornos & Equipos Gastronómicos SA','011 4302-9911', 'repuestos@hornosyequipos.com.ar', '30-70111333-7'),
  (6, 6, 'Lubricantes del Plata',            '011 4209-6655', 'ventas@lubridelplata.com.ar',  '30-71666777-0');

insert into plan_mantenimiento (
  pm_id_plan, te_id, pm_nombre_plan, pm_descripcion_plan, pm_frecuencia, pm_plazo_dias,
  pm_estado, pm_hora_emision
) overriding system value values
  (1,  1, 'Mantenimiento mensual de heladeras',       'Limpieza del condensador, control de temperatura y revisión de burletes de las heladeras exhibidoras.', 30,  5,  'activo',   8),
  (2,  2, 'Service trimestral de cámaras',            'Control de temperatura, presiones y parte eléctrica de las cámaras frigoríficas.',                       90,  7,  'activo',   8),
  (3,  3, 'Mantenimiento de hornos',                  'Limpieza de quemadores y revisión eléctrica de los hornos de panadería.',                                 45,  5,  'activo',   8),
  (4,  4, 'Limpieza de filtros de aires',             'Limpieza de filtros y control de gas de los equipos de aire acondicionado.',                             60,  7,  'activo',   8),
  (5,  5, 'Calibración mensual de balanzas',          'Calibración con pesas patrón de todas las balanzas de venta.',                                           30,  3,  'activo',   8),
  (6,  6, 'Afilado y lubricación de cortadoras',      'Afilado de cuchillas y lubricación. Se dio de baja: ahora lo hace el proveedor de las cortadoras.',      15,  2,  'inactivo', 8),
  (7,  8, 'Prueba mensual del grupo electrógeno',     'Arranque y prueba con carga para asegurar el respaldo ante cortes de luz.',                              30,  2,  'activo',   8),
  (8,  8, 'Service anual del grupo electrógeno',      'Cambio de aceite y filtros y revisión eléctrica completa del grupo electrógeno.',                        365, 10, 'activo',   8),
  (9,  9, 'Descongelado y limpieza de freezers',      'Limpieza del condensador y control de temperatura de los freezers horizontales.',                        60,  5,  'activo',   8),
  (10, 7, 'Mantenimiento preventivo de cajas',        'Limpieza y revisión de impresora, lector y teclado de cada caja.',                                       90,  5,  'activo',   8);

insert into tarea_prevista_plan (pm_id_plan, tag_id_tarea) values
  (1, 2), (1, 3), (1, 4),
  (2, 3), (2, 5), (2, 6),
  (3, 6), (3, 7),
  (4, 5), (4, 8),
  (5, 9),
  (6, 10), (6, 11),
  (7, 12),
  (8, 6), (8, 13),
  (9, 2), (9, 3),
  (10, 14);

-- ---------------------------------------------------------------------
-- 5. Work orders, solicitudes and tareas, built in staging tables first
--    so their final ids can follow creation order.
-- ---------------------------------------------------------------------
create temp table s_eq on commit drop as
select eq_id_equipo as eq, te_id as te, lu_codigo as lu, eq_fecha_instalacion as inst,
       case eq_codigo
         when 'FRZ-003' then current_date - 100
         when 'POS-005' then current_date - 150
       end as baja,
       eq_pendiente_instalacion as pendiente
  from equipo;

create temp table s_sol (
  k           serial primary key,
  eq          int not null,
  solicitante uuid not null,
  descr       text not null,
  creada      timestamptz not null,
  estado      solicitud_estado_t not null default 'pendiente',
  motivo      text,
  comentario  text,
  cerrada_en  timestamptz
) on commit drop;

create temp table s_ot (
  k         serial primary key,
  sol_k     int,
  plan      int,
  eq        int not null,
  tipo      text not null,
  prioridad urgency_t not null,
  inicio    date not null,
  estimada  date,
  observ    text,
  creada    timestamptz not null,
  fallo     int,
  replan    boolean not null default false
) on commit drop;

create temp table s_task (
  k           serial primary key,
  ot_k        int not null,
  ord         int not null,
  tag         int not null,
  tec         uuid not null,
  asignada    timestamptz not null,
  ini         date,
  fin         date,
  diag        text,
  susp        date,
  susp_motivo text,
  susp_coment text,
  susp_fin    date
) on commit drop;

create temp table s_rep (task_k int not null, rep int not null, cant int not null) on commit drop;

-- What each corrective scenario looks like, by tipo de equipo.
create temp table s_tpl (
  te int, fallo int, prio urgency_t, descr text, tasks int[], reps int[], cants int[], diag text
) on commit drop;

insert into s_tpl values
  (1, 1,  'high',   'La heladera no enfría, los lácteos están a 10 °C.',                    '{15,5}',  '{1}',     '{2}',   'Pérdida en la soldadura del evaporador. Se soldó, se hizo vacío y se recargó gas.'),
  (1, 10, 'low',    'El burlete de la puerta está roto y la puerta no cierra bien.',        '{19}',    '{3}',     '{3}',   'Se reemplazaron los burletes de las dos puertas.'),
  (1, 14, 'low',    'Se quemaron las luces de la heladera y no se ve la mercadería.',       '{6}',     '{20}',    '{2}',   'Se cambiaron dos lámparas LED y se revisó la fuente.'),
  (1, 11, 'low',    'Hay agua en el piso debajo de la heladera.',                           '{22}',    '{}',      '{}',    'El desagote estaba tapado. Se destapó y se limpió la bandeja.'),
  (1, 5,  'medium', 'El motor de la heladera hace mucho ruido.',                            '{15,18}', '{7}',     '{1}',   'Rodamiento del ventilador del condensador gastado. Se reemplazó el ventilador.'),
  (1, 6,  'medium', 'La temperatura de la heladera sube y baja durante el día.',            '{3}',     '{5}',     '{1}',   'Termostato descalibrado. Se reemplazó por uno digital.'),
  (2, 1,  'high',   'La cámara marca 7 °C y debería estar en 2 °C.',                        '{15,5}',  '{1}',     '{4}',   'Baja carga de gas por una pérdida en una válvula. Se reparó y se recargó.'),
  (2, 3,  'high',   'El compresor de la cámara no arranca, se escucha un clic.',            '{15,16}', '{4}',     '{1}',   'Compresor con el bobinado quemado. Se reemplazó el compresor.'),
  (2, 6,  'medium', 'La temperatura de la cámara oscila mucho.',                            '{3}',     '{5}',     '{1}',   'Sensor del termostato dañado. Se cambió el termostato.'),
  (2, 10, 'low',    'La puerta de la cámara no cierra hermético.',                          '{19}',    '{3}',     '{4}',   'Se cambió el burlete de la puerta y se ajustaron las bisagras.'),
  (3, 7,  'medium', 'El horno no calienta en la parte de abajo.',                           '{17}',    '{8}',     '{1}',   'Resistencia inferior cortada. Se reemplazó.'),
  (3, 5,  'low',    'El carro del horno rotativo hace ruido al girar.',                     '{11}',    '{9}',     '{1}',   'Falta de lubricación en el eje del carro. Se lubricó.'),
  (3, 4,  'high',   'Salta la térmica cuando se prende el horno.',                          '{15,20}', '{11,12}', '{1,1}', 'Cable recalentado en la bornera. Se reemplazó el cable y los fusibles.'),
  (4, 12, 'low',    'El aire tira poco frío y hay olor a humedad.',                         '{8}',     '{6}',     '{2}',   'Filtros saturados. Se reemplazaron y se limpió la bandeja.'),
  (4, 11, 'low',    'Gotea agua del aire sobre la góndola.',                                '{22}',    '{}',      '{}',    'Manguera de desagote desconectada. Se reconectó y se aseguró.'),
  (4, 2,  'high',   'El aire no enfría nada y hace mucho calor en el sector.',              '{15,5}',  '{2}',     '{2}',   'Pérdida de gas en la unidad exterior. Se reparó y se recargó R134a.'),
  (5, 8,  'medium', 'La balanza marca de más con las pesas patrón.',                        '{9}',     '{}',      '{}',    'Se calibró con pesas patrón de 1 y 5 kg.'),
  (5, 9,  'medium', 'No funcionan algunas teclas de la balanza.',                           '{15}',    '{17}',    '{1}',   'Membrana del teclado gastada. Se reemplazó.'),
  (6, 13, 'low',    'La cortadora desgarra el fiambre, no corta parejo.',                   '{10}',    '{}',      '{}',    'Se afiló la cuchilla y se ajustó el plato.'),
  (6, 4,  'medium', 'La cortadora se apaga sola mientras se usa.',                          '{6}',     '{11}',    '{1}',   'Fusible del motor flojo. Se cambió y se ajustaron los bornes.'),
  (7, 9,  'high',   'La pantalla de la caja se congela y hay que reiniciarla.',             '{21}',    '{}',      '{}',    'Se actualizó el software del punto de venta y se liberó espacio en el disco.'),
  (7, 9,  'medium', 'La impresora de la caja no imprime los tickets.',                      '{14}',    '{15}',    '{1}',   'Cabezal sucio y rollo mal colocado. Se limpió y se cambió el rollo.'),
  (8, 4,  'high',   'El grupo electrógeno no arrancó en el último corte de luz.',           '{15,12}', '{19}',    '{1}',   'Batería agotada. Se reemplazó y se hizo prueba con carga.'),
  (9, 1,  'high',   'El freezer está a -8 °C y la mercadería se ablanda.',                  '{15,5}',  '{1}',     '{1}',   'Baja carga de gas. Se recargó y se controló la presión.'),
  (9, 10, 'low',    'La tapa del freezer no cierra bien.',                                  '{19}',    '{3}',     '{2}',   'Se reemplazó el burlete de la tapa.'),
  (10, 4, 'medium', 'El autoelevador no carga la batería.',                                 '{24}',    '{}',      '{}',    'Conector del cargador sulfatado. Se limpió y se ajustó.');

-- Preventive cycles that are open right now (the rest are idle: done,
-- next one not due yet). phi = days since it was emitted.
create temp table s_mode (plan int, eq int, mode text, phi int, tec uuid) on commit drop;

insert into s_mode values
  (1, 2,  'assigned', 0,   '00000000-0000-4000-8000-000000009101'),  -- emitted today
  (1, 5,  'progress', 8,   '00000000-0000-4000-8000-000000009102'),  -- 3 days late
  (2, 9,  'progress', 3,   '00000000-0000-4000-8000-000000009101'),
  (4, 16, 'assigned', 1,   '00000000-0000-4000-8000-000000009102'),
  (5, 19, 'assigned', 5,   '00000000-0000-4000-8000-000000009104'),  -- 2 days late, not started
  (7, 28, 'assigned', 0,   '00000000-0000-4000-8000-000000009103'),
  (8, 28, 'idle',     120, null);                                    -- yearly service 4 months ago

do $$
declare
  c_admin constant uuid := '00000000-0000-4000-8000-000000009000';
  c_t1    constant uuid := '00000000-0000-4000-8000-000000009101';
  c_t2    constant uuid := '00000000-0000-4000-8000-000000009102';
  c_t3    constant uuid := '00000000-0000-4000-8000-000000009103';
  c_t4    constant uuid := '00000000-0000-4000-8000-000000009104';
  c_t5    constant uuid := '00000000-0000-4000-8000-000000009105';
  c_u1    constant uuid := '00000000-0000-4000-8000-000000009201';
  c_u2    constant uuid := '00000000-0000-4000-8000-000000009202';
  c_u3    constant uuid := '00000000-0000-4000-8000-000000009203';
  c_u4    constant uuid := '00000000-0000-4000-8000-000000009204';
  c_u5    constant uuid := '00000000-0000-4000-8000-000000009205';
  c_u6    constant uuid := '00000000-0000-4000-8000-000000009206';

  v_today  date := current_date;
  v_window date := current_date - 185;

  -- Corrective failures are drawn from here: repeated ids fail more often.
  v_pool int[] := array[3,3,3,3,8,8,8,8,13,13,13,11,11,11,24,24,24,31,31,31,1,1,4,4,17,17,
                        2,5,6,9,10,12,14,15,16,18,19,20,21,22,23,25,26,27,28,29,30,32];

  p    record;
  e    record;
  tpl  record;
  v_mode text;
  v_phi  int;
  v_tec  uuid;
  v_tags int[];
  v_n    int;
  v_floor_end  date;
  v_inst_floor date;
  v_due    date;
  v_fin    date;
  v_anchor date;
  v_last   date;
  v_first_anchor date;
  v_delay int;
  v_ini   date;
  v_tfin  date;
  v_dur   int;
  v_ot    int;
  v_sol   int;
  v_task  int;
  v_ref   date;
  v_eq    int;
  v_sol_ts timestamptz;
  v_ot_ts  timestamptz;
  v_prio   urgency_t;
  v_inicio date;
  v_est    date;
  v_replan boolean;
  v_motivo text;
  v_susp     date;
  v_susp_fin date;
  v_susp_mot text;
  v_diag     text;
  v_fallo_nombre text;
  v_solicitante  uuid;
  v_inst6 date;
  j int;
  x int;

  -- Técnicos a tipo de equipo is assigned to: frío, eléctrico / mecánico or
  -- cajas y balanzas. Carlos Medina (inactive, left 30 days ago) only gets
  -- OTs started before day -50, so every one of his tareas ended before he
  -- left.
  v_cands uuid[];
begin
  perform setseed(0.2026);

  -- ---------------- Preventive OTs, cycle by cycle -------------------
  -- Built backwards from today: each resolved cycle ends where the next
  -- one's anchor (me_fecha_ult_mant) is, exactly what the triggers do.
  for p in
    select pm_id_plan, te_id, pm_nombre_plan, pm_frecuencia as f, pm_plazo_dias as plazo, pm_estado
      from plan_mantenimiento
      order by pm_id_plan
  loop
    select array_agg(tag_id_tarea order by tag_id_tarea) into v_tags
      from tarea_prevista_plan where pm_id_plan = p.pm_id_plan;
    v_n := coalesce(array_length(v_tags, 1), 0);

    for e in select * from s_eq where te = p.te_id and not pendiente order by eq loop
      v_mode := null; v_phi := null; v_tec := null;
      select m.mode, m.phi, m.tec into v_mode, v_phi, v_tec
        from s_mode m where m.plan = p.pm_id_plan and m.eq = e.eq;
      v_mode := coalesce(v_mode, 'idle');

      -- An inactive plan stopped 40 days ago; an equipo dado de baja, on
      -- its date.
      v_floor_end := least(
        coalesce(e.baja, v_today),
        case when p.pm_estado = 'inactivo' then v_today - 40 else v_today end
      );
      -- HEL-006 was installed about two months ago: its cycles start there.
      v_inst_floor := case when e.eq = 6 then v_today - 75 end;

      if v_mode = 'idle' then
        v_phi := coalesce(v_phi, 1 + floor(random() * (p.f - 1))::int);
        v_fin := v_floor_end - v_phi;
        v_last := v_fin;
      else
        v_due := v_today - v_phi;
        insert into s_ot (plan, eq, tipo, prioridad, inicio, estimada, observ, creada)
        values (p.pm_id_plan, e.eq, 'preventivo', 'medium', v_due, v_due + p.plazo,
                format('Mantenimiento preventivo del plan "%s".', p.pm_nombre_plan),
                least(v_due + time '08:00', now()))
        returning k into v_ot;

        for j in 1..v_n loop
          v_ini := null; v_tfin := null;
          if v_mode = 'progress' then
            if j = 1 then
              v_ini := v_due + 1;
              if v_n > 1 and v_phi >= 3 then v_tfin := v_due + 2; end if;
            elsif j = 2 and v_phi >= 3 then
              v_ini := v_due + 2;
            end if;
          end if;
          insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin)
          values (v_ot, j, v_tags[j], v_tec, least(v_due + time '08:00', now()), v_ini, v_tfin);
        end loop;

        v_last := v_due - p.f;
        v_fin := v_last;
      end if;

      v_first_anchor := null;
      loop
        -- 80% closed within the plazo, the rest 1 to 5 days late.
        if random() < 0.8 then
          v_delay := floor(random() * (p.plazo + 1))::int;
        else
          v_delay := p.plazo + 1 + floor(random() * 5)::int;
        end if;
        v_due := v_fin - v_delay;
        v_anchor := v_due - p.f;
        exit when v_due < v_window;
        exit when v_inst_floor is not null and v_anchor < v_inst_floor;

        if e.te in (1, 2, 4, 9) then
          v_cands := case when v_due < v_today - 50 then array[c_t1, c_t2, c_t5] else array[c_t1, c_t2] end;
        elsif e.te in (3, 8, 10) then
          v_cands := case when v_due < v_today - 50 then array[c_t3, c_t5] else array[c_t3, c_t1] end;
        else
          v_cands := array[c_t4, c_t3];
        end if;
        v_tec := v_cands[1 + floor(random() * array_length(v_cands, 1))::int];

        insert into s_ot (plan, eq, tipo, prioridad, inicio, estimada, observ, creada)
        values (p.pm_id_plan, e.eq, 'preventivo', 'medium', v_due, v_due + p.plazo,
                format('Mantenimiento preventivo del plan "%s".', p.pm_nombre_plan),
                v_due + time '08:00')
        returning k into v_ot;

        v_ini := v_due + least(v_delay, floor(random() * 2)::int);
        for j in 1..v_n loop
          v_tfin := case when j = v_n then v_fin else v_ini + ((v_fin - v_ini) * j / v_n) end;
          insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin)
          values (v_ot, j, v_tags[j], v_tec, v_due + time '08:00', v_ini, v_tfin);
        end loop;

        v_first_anchor := v_anchor;
        v_fin := v_anchor;
      end loop;

      insert into mantenimiento_equipo (pm_id_plan, eq_id_equipo, me_fecha_ult_mant)
      values (p.pm_id_plan, e.eq, v_last);

      if e.eq = 6 then
        update s_eq set inst = coalesce(v_first_anchor, v_last) where eq = 6;
      end if;
    end loop;
  end loop;

  select inst into v_inst6 from s_eq where eq = 6;
  update equipo set eq_fecha_instalacion = v_inst6 where eq_id_equipo = 6;

  -- ---------------- Historical correctivas ---------------------------
  for i in 1..46 loop
    v_ref := v_today - (182 - round(i * 3.7)::int);

    loop
      v_eq := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
      select * into e from s_eq where eq = v_eq;
      exit when not e.pendiente
            and e.inst < v_ref - 1
            and (e.baja is null or v_ref < e.baja - 1);
    end loop;

    select * into tpl from s_tpl where te = e.te order by random() limit 1;
    select fa_nombre into v_fallo_nombre from fallo where fa_id_fallo = tpl.fallo;

    v_solicitante := case e.lu
      when 1 then case when v_ref < v_today - 60 and random() < 0.4 then c_u6 else c_u1 end
      when 2 then c_u2
      when 4 then c_u2
      when 3 then c_u3
      when 7 then c_u5
      when 8 then c_admin
      else c_u4
    end;
    v_sol_ts := v_ref + make_interval(hours => 7 + floor(random() * 12)::int,
                                      mins => floor(random() * 60)::int);

    -- About one in eight is closed without an OT.
    if random() < 0.13 then
      v_motivo := (array['Duplicada', 'Falsa alarma', 'Se resolvió sin OT (ajuste menor)',
                         'Falsa alarma', 'Otro'])[1 + floor(random() * 5)::int];
      insert into s_sol (eq, solicitante, descr, creada, estado, motivo, comentario, cerrada_en)
      values (e.eq, v_solicitante, tpl.descr, v_sol_ts, 'rechazada', v_motivo,
              case when v_motivo = 'Otro'
                then 'Se reportó sobre el equipo equivocado; la falla era de otro sector.' end,
              v_sol_ts + make_interval(hours => 1 + floor(random() * 20)::int));
      continue;
    end if;

    insert into s_sol (eq, solicitante, descr, creada)
    values (e.eq, v_solicitante, tpl.descr, v_sol_ts)
    returning k into v_sol;

    v_prio := case
      when random() < 0.25 then (array['low', 'medium', 'high']::urgency_t[])[1 + floor(random() * 3)::int]
      else tpl.prio
    end;
    v_ot_ts := v_sol_ts + make_interval(mins => case v_prio
      when 'high'   then 20 + floor(random() * 180)::int
      when 'medium' then 60 + floor(random() * 1200)::int
      else 240 + floor(random() * 2600)::int
    end);
    v_inicio := v_ot_ts::date;
    v_est := v_inicio + case v_prio when 'high' then 2 when 'medium' then 5 else 10 end;
    v_replan := random() < 0.1;
    if v_replan then v_est := v_est + 3; end if;

    insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada, fallo, replan)
    values (v_sol, e.eq, 'correctivo', v_prio, v_inicio, v_est, v_ot_ts, tpl.fallo, v_replan)
    returning k into v_ot;

    v_n := array_length(tpl.tasks, 1);
    v_ini := v_inicio + case v_prio
      when 'high' then 0
      when 'medium' then floor(random() * 2)::int
      else floor(random() * 3)::int
    end;

    for j in 1..v_n loop
      if e.te in (1, 2, 4, 9) then
        v_cands := case when v_inicio < v_today - 50 then array[c_t1, c_t2, c_t5] else array[c_t1, c_t2] end;
      elsif e.te in (3, 8, 10) then
        v_cands := case when v_inicio < v_today - 50 then array[c_t3, c_t5] else array[c_t3, c_t1] end;
      else
        v_cands := array[c_t4, c_t3];
      end if;
      v_tec := v_cands[1 + floor(random() * array_length(v_cands, 1))::int];

      v_dur := case tpl.tasks[j]
        when 15 then floor(random() * 2)::int
        when 16 then 1 + floor(random() * 3)::int
        else floor(random() * 3)::int
      end;
      if random() < 0.2 then v_dur := v_dur + 2 + floor(random() * 4)::int; end if;

      v_susp := null; v_susp_fin := null; v_susp_mot := null;
      if j = v_n and random() < 0.18 then
        v_susp := v_ini + floor(random() * 2)::int;
        v_susp_fin := v_susp + 1 + floor(random() * 5)::int;
        v_susp_mot := (array['Falta de repuestos', 'Falta de repuestos', 'Esperando proveedor externo',
                             'Equipo no disponible', 'Requiere autorización'])[1 + floor(random() * 5)::int];
        v_dur := greatest(v_dur, (v_susp_fin - v_ini) + floor(random() * 2)::int);
      end if;

      v_tfin := v_ini + v_dur;
      if v_tfin > v_today - 1 then v_tfin := v_today - 1; end if;
      if v_ini > v_tfin then v_ini := v_tfin; end if;
      if v_susp is not null and v_susp_fin > v_tfin then
        v_susp_fin := v_tfin;
        if v_susp > v_susp_fin then v_susp := v_susp_fin; end if;
      end if;

      v_diag := case
        when j = v_n then tpl.diag
        when tpl.tasks[j] = 15 then 'Se revisó el equipo y se confirmó la falla: ' || lower(v_fallo_nombre) || '.'
      end;

      insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin, diag, susp, susp_motivo, susp_fin)
      values (v_ot, j, tpl.tasks[j], v_tec, v_ot_ts + j * interval '3 minutes',
              v_ini, v_tfin, v_diag, v_susp, v_susp_mot, v_susp_fin)
      returning k into v_task;

      if j = v_n then
        for x in 1..coalesce(array_length(tpl.reps, 1), 0) loop
          insert into s_rep values (v_task, tpl.reps[x],
                                    tpl.cants[x] + case when random() < 0.3 then 1 else 0 end);
        end loop;
      end if;

      v_ini := v_tfin;
    end loop;
  end loop;

  -- ---------------- What's happening right now ----------------------

  -- Pending solicitudes, no OT yet.
  insert into s_sol (eq, solicitante, descr, creada) values
    (4,  c_u2, 'La heladera de carnes hace hielo en el fondo y no enfría arriba.',     now() - interval '3 hours'),
    (15, c_u4, 'El aire acondicionado de las oficinas no enciende.',                   v_today - 1 + time '16:10'),
    (20, c_u1, 'La balanza de verdulería no vuelve a cero después de pesar.',          v_today - 2 + time '11:05');

  -- Closed without OT three days ago.
  insert into s_sol (eq, solicitante, descr, creada, estado, motivo, cerrada_en) values
    (23, c_u5, 'La caja 1 no enciende.', v_today - 3 + time '09:20', 'rechazada', 'Falsa alarma',
     v_today - 3 + time '10:05');

  -- Critical OT (correctivo, Alta) generated this morning, not started.
  insert into s_sol (eq, solicitante, descr, creada)
  values (8, c_u4, 'La cámara de carnes está a 8 °C y la temperatura sigue subiendo.', now() - interval '4 hours')
  returning k into v_sol;
  insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada, fallo)
  values (v_sol, 8, 'correctivo', 'high', (now() - interval '210 minutes')::date,
          (now() - interval '210 minutes')::date + 2, now() - interval '210 minutes', 1)
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada) values
    (v_ot, 1, 15, c_t1, now() - interval '205 minutes'),
    (v_ot, 2, 5,  c_t1, now() - interval '204 minutes');

  -- In progress: the técnico started yesterday.
  insert into s_sol (eq, solicitante, descr, creada)
  values (11, c_u3, 'El horno rotativo no levanta temperatura y el pan sale crudo.', v_today - 2 + time '07:30')
  returning k into v_sol;
  insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada, fallo)
  values (v_sol, 11, 'correctivo', 'medium', v_today - 2, v_today + 3, v_today - 2 + time '09:00', 7)
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada, ini)
  values (v_ot, 1, 17, c_t3, v_today - 2 + time '09:03', v_today - 1);

  -- Overdue, with its second tarea suspended for lack of gas (the
  -- pedido de compra 8 below asks for it).
  insert into s_sol (eq, solicitante, descr, creada)
  values (13, c_u1, 'El aire del salón norte no enfría, hace mucho calor en la zona de góndolas.', v_today - 10 + time '10:20')
  returning k into v_sol;
  insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada, fallo)
  values (v_sol, 13, 'correctivo', 'medium', v_today - 10, v_today - 5, v_today - 10 + time '13:00', 2)
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin, diag) values
    (v_ot, 1, 15, c_t2, v_today - 10 + time '13:03', v_today - 9, v_today - 9,
     'Pérdida de gas en la unidad exterior. Hay que reparar y recargar R134a.');
  insert into s_task (ot_k, ord, tag, tec, asignada, ini, susp, susp_motivo) values
    (v_ot, 2, 5, c_t2, v_today - 10 + time '13:06', v_today - 8, v_today - 8, 'Falta de repuestos');

  -- Critical and overdue, in progress.
  insert into s_sol (eq, solicitante, descr, creada)
  values (24, c_u5, 'La caja 2 se reinicia sola en medio de las ventas.', v_today - 4 + time '08:10')
  returning k into v_sol;
  insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada, fallo)
  values (v_sol, 24, 'correctivo', 'high', v_today - 4, v_today - 2, v_today - 4 + time '08:40', 9)
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada, ini)
  values (v_ot, 1, 21, c_t4, v_today - 4 + time '08:43', v_today - 3);

  -- Generated a moment ago, the admin still has to add its tareas.
  insert into s_sol (eq, solicitante, descr, creada)
  values (29, c_u1, 'El freezer de helados hace un ruido fuerte cada vez que arranca.', now() - interval '2 hours')
  returning k into v_sol;
  insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada)
  values (v_sol, 29, 'correctivo', 'low', (now() - interval '1 hour')::date,
          (now() - interval '1 hour')::date + 10, now() - interval '1 hour');

  -- Resolved yesterday, on time.
  insert into s_sol (eq, solicitante, descr, creada)
  values (17, c_u2, 'La balanza de la carnicería marca 30 g de más.', v_today - 3 + time '09:15')
  returning k into v_sol;
  insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada, fallo)
  values (v_sol, 17, 'correctivo', 'medium', v_today - 3, v_today + 2, v_today - 3 + time '10:00', 8)
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin, diag)
  values (v_ot, 1, 9, c_t4, v_today - 3 + time '10:03', v_today - 2, v_today - 1,
          'Se calibró con pesas patrón de 1 y 5 kg. Quedó dentro de la tolerancia.');

  -- Resolved late: the compressor took three days to arrive.
  insert into s_sol (eq, solicitante, descr, creada)
  values (3, c_u1, 'La heladera de bebidas no enfría, las gaseosas están tibias.', v_today - 14 + time '08:00')
  returning k into v_sol;
  insert into s_ot (sol_k, eq, tipo, prioridad, inicio, estimada, creada, fallo)
  values (v_sol, 3, 'correctivo', 'high', v_today - 14, v_today - 12, v_today - 14 + time '08:30', 3)
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin, diag) values
    (v_ot, 1, 15, c_t1, v_today - 14 + time '08:33', v_today - 14, v_today - 14,
     'El compresor no arranca: bobinado quemado.');
  insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin, diag, susp, susp_motivo, susp_fin) values
    (v_ot, 2, 16, c_t1, v_today - 14 + time '08:36', v_today - 13, v_today - 9,
     'Se reemplazó el compresor y se recargó gas R404A.',
     v_today - 13, 'Esperando proveedor externo', v_today - 10)
  returning k into v_task;
  insert into s_rep values (v_task, 4, 1), (v_task, 1, 2);

  -- Installation pending: HEL-007 was registered three days ago.
  insert into s_ot (eq, tipo, prioridad, inicio, estimada, observ, creada)
  values (7, 'instalacion', 'medium', v_today - 3, v_today + 4,
          'Instalación y puesta en marcha del equipo nuevo.', v_today - 3 + time '10:15')
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada)
  values (v_ot, 1, 1, c_t1, v_today - 3 + time '10:15');

  -- HEL-006's installation, finished the day it joined its plan.
  insert into s_ot (eq, tipo, prioridad, inicio, estimada, observ, creada)
  values (6, 'instalacion', 'medium', v_inst6 - 6, v_inst6 + 1,
          'Instalación y puesta en marcha del equipo nuevo.', v_inst6 - 6 + time '10:00')
  returning k into v_ot;
  insert into s_task (ot_k, ord, tag, tec, asignada, ini, fin, diag)
  values (v_ot, 1, 1, c_t2, v_inst6 - 6 + time '10:00', v_inst6 - 1, v_inst6,
          'Equipo instalado, nivelado y probado. Llegó a su temperatura de trabajo en 3 horas.');
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Staging -> real tables, ids in creation order
-- ---------------------------------------------------------------------
create temp table m_sol on commit drop as
select k, (row_number() over (order by creada, k))::int as id from s_sol;

insert into solicitudes (
  sol_id_solicitud, eq_id_equipo, p_legajo_solicitante, sol_descripcion, sol_estado,
  sol_motivo_rechazo, sol_comentario_rechazo, sol_fecha_hora
) overriding system value
select m.id, s.eq, s.solicitante, s.descr, s.estado, s.motivo, s.comentario, s.creada
  from s_sol s join m_sol m using (k);

-- estado and fin derived from the tareas, like sync_orden_estado (0017).
create temp table m_ot on commit drop as
select o.k,
       (row_number() over (order by o.creada, o.k))::int as id,
       (case
          when count(t.k) > 0 and count(t.fin) = count(t.k) then 'resolved'
          when count(t.ini) > 0 then 'in_progress'
          else 'assigned'
        end)::orden_estado_t as estado,
       case when count(t.k) > 0 and count(t.fin) = count(t.k) then max(t.fin) end as fin
  from s_ot o
  left join s_task t on t.ot_k = o.k
  group by o.k, o.creada;

insert into orden_de_trabajo (
  ot_id_orden, sol_id_solicitud, plan_id_manequipo, eq_id_equipo, ot_tipo_orden,
  ot_fecha_inicio, ot_fecha_fin, ot_fecha_estimada_fin, ot_observacion, ot_estado,
  ot_prioridad, ot_creada_en
) overriding system value
select m.id, ms.id, o.plan, o.eq, o.tipo, o.inicio, m.fin, o.estimada, o.observ, m.estado,
       o.prioridad, o.creada
  from s_ot o
  join m_ot m using (k)
  left join m_sol ms on ms.k = o.sol_k;

update solicitudes s
  set sol_estado = case when o.ot_estado = 'resolved' then 'resuelta' else 'en_proceso' end::solicitud_estado_t
  from orden_de_trabajo o
  where o.sol_id_solicitud = s.sol_id_solicitud;

create temp table m_task on commit drop as
select k, (row_number() over (order by asignada, k))::int as id from s_task;

insert into tareas_realizadas_orden (
  taro_id_tarea_orden, ot_id_orden, tag_id_tarea, p_id_tecnico, taro_fecha_inicio,
  taro_fecha_fin, taro_diagnostico, taro_fecha_suspension, taro_motivo_suspension,
  taro_comentario_suspension, taro_fecha_fin_suspension
) overriding system value
select mt.id, mo.id, t.tag, t.tec, t.ini, t.fin, t.diag, t.susp, t.susp_motivo,
       t.susp_coment, t.susp_fin
  from s_task t
  join m_task mt using (k)
  join m_ot mo on mo.k = t.ot_k;

insert into repuesto_para_tarea (taro_id_tarea_orden, rep_id, repta_canti_usada)
select mt.id, r.rep, r.cant
  from s_rep r join m_task mt on mt.k = r.task_k;

insert into fallo_por_orden (fa_id_fallo, ot_id_orden, fpo_fecha_deteccion)
select o.fallo, m.id, o.inicio
  from s_ot o join m_ot m using (k)
  where o.fallo is not null;

-- ---------------------------------------------------------------------
-- 7. Historial, with the same notes the app and the triggers write
-- ---------------------------------------------------------------------
create temp table h_task on commit drop as
select t.*,
       o.eq,
       g.tag_nombre_tarea as nombre,
       case when t.ini is not null then
         greatest(t.ini + time '09:00' + t.ord * interval '25 minutes', t.asignada + interval '20 minutes')
       end as ini_ts
  from s_task t
  join s_ot o on o.k = t.ot_k
  join tareas_generales g on g.tag_id_tarea = t.tag;

alter table h_task add column fin_ts timestamptz;
update h_task
  set fin_ts = greatest(fin + time '16:00' + ord * interval '10 minutes', ini_ts + interval '1 hour')
  where fin is not null;

create temp table h_ot on commit drop as
select o.*, m.estado, m.fin,
       (select max(t.fin_ts) from h_task t where t.ot_k = o.k) as resuelta_ts,
       (select t.tec from h_task t where t.ot_k = o.k order by t.fin_ts desc nulls last limit 1) as ult_tec
  from s_ot o join m_ot m using (k);

insert into historial (eq_id_equipo, hi_tipo, hi_nota, hi_autor_id, hi_fecha_hora)
-- Fault reported
select eq, 'Reporte', descr, solicitante, creada from s_sol
union all
-- Closed without OT
select eq, 'Cerrada',
       'Solicitud cerrada sin orden de trabajo: ' || motivo || coalesce(' - ' || comentario, ''),
       '00000000-0000-4000-8000-000000009000'::uuid, cerrada_en
  from s_sol where estado = 'rechazada'
union all
-- Corrective OT generated from its solicitud
select o.eq, 'Asignada', 'Orden de trabajo generada: ' || s.descr,
       '00000000-0000-4000-8000-000000009000'::uuid, o.creada
  from h_ot o join s_sol s on s.k = o.sol_k
union all
-- Falla genérica set on the OT
select eq, 'Diagnóstico', 'Falla genérica de la orden actualizada.',
       '00000000-0000-4000-8000-000000009000'::uuid, creada + interval '2 minutes'
  from h_ot where tipo = 'correctivo' and fallo is not null
union all
-- Fecha requerida de cierre rescheduled
select eq, 'Replanificada',
       'Fecha requerida de cierre fijada para el ' || to_char(estimada, 'YYYY-MM-DD') || '.',
       '00000000-0000-4000-8000-000000009000'::uuid, creada + interval '1 day'
  from h_ot where replan
union all
-- Preventive OT emitted by the system
select o.eq, 'Asignada',
       format('Orden de mantenimiento preventivo generada (plan "%s").', p.pm_nombre_plan),
       null, o.creada
  from h_ot o join plan_mantenimiento p on p.pm_id_plan = o.plan
union all
-- Installation OT from the alta de equipo
select eq, 'Asignada', 'Orden de instalación generada para el equipo nuevo.',
       '00000000-0000-4000-8000-000000009000'::uuid, creada
  from h_ot where tipo = 'instalacion'
union all
-- Tareas added by the admin to a corrective OT
select t.eq, 'Asignada', 'Tarea agregada a la orden: ' || t.nombre,
       '00000000-0000-4000-8000-000000009000'::uuid, t.asignada
  from h_task t join s_ot o on o.k = t.ot_k
  where o.tipo = 'correctivo'
union all
select eq, 'En curso', 'Tarea iniciada: ' || nombre, tec, ini_ts
  from h_task where ini is not null
union all
select eq, 'Suspendida',
       'Tarea suspendida: ' || nombre || '. Motivo: ' || susp_motivo || coalesce(' - ' || susp_coment, ''),
       tec, greatest(susp + time '11:00', ini_ts + interval '30 minutes')
  from h_task where susp is not null
union all
select eq, 'Reanudada',
       format('Tarea reanudada: %s (suspendida desde el %s)', nombre, to_char(susp, 'FMDD/FMMM/YYYY')),
       tec, greatest(susp_fin + time '09:30', ini_ts + interval '2 hours')
  from h_task where susp_fin is not null
union all
select eq, 'Tarea finalizada',
       'Tarea finalizada: ' || nombre || coalesce('. Diagnóstico: ' || diag, ''),
       tec, fin_ts
  from h_task where fin is not null
union all
select eq, 'Resuelta', 'Todas las tareas de la orden fueron completadas.',
       ult_tec, resuelta_ts + interval '1 minute'
  from h_ot where estado = 'resolved'
union all
-- Logged by trg_ot_preventiva_resuelta (0035)
select o.eq, 'Preventivo',
       format('Mantenimiento preventivo completado (plan "%s"). Próximo vencimiento: %s.',
              p.pm_nombre_plan, to_char(o.fin + p.pm_frecuencia, 'DD/MM/YYYY')),
       o.ult_tec, o.resuelta_ts + interval '2 minutes'
  from h_ot o join plan_mantenimiento p on p.pm_id_plan = o.plan
  where o.estado = 'resolved'
union all
-- Logged by finalizar_tarea (0032) when the installation tarea finishes
select eq, 'Instalación',
       format('Equipo instalado el %s. Se incorporó a 1 plan de mantenimiento de su tipo.',
              to_char(fin, 'DD/MM/YYYY')),
       ult_tec, resuelta_ts
  from h_ot where tipo = 'instalacion' and estado = 'resolved';

-- ---------------------------------------------------------------------
-- 8. Pedidos de compra, compras, remitos and stock movements
-- ---------------------------------------------------------------------
insert into compras (
  co_id_compra, prov_id_proveedor, co_nombre, co_fecha_compra, co_costo_total,
  co_p_id_registrador, co_tipo_comprobante, co_punto_venta, co_letra
) overriding system value
select id, prov, nro, current_date - dias, 0, '00000000-0000-4000-8000-000000009000'::uuid,
       tipo::comprobante_tipo_t, pv, letra
from (values
  (1,  1, '00012457', 175, 'factura', '00003', 'A'),
  (2,  1, '00012980', 146, 'factura', '00003', 'A'),
  (3,  2, '00045210', 130, 'factura', '00011', 'B'),
  (4,  5, '00000873', 118, 'tique',   '00002', null),
  (5,  3, '00007731', 100, 'factura', '00002', 'C'),
  (6,  6, '00003310', 85,  'remito',  '00001', null),
  (7,  4, '00021877', 66,  'factura', '00005', 'B'),
  (8,  1, '00013544', 55,  'factura', '00003', 'A'),
  (9,  3, '00008102', 38,  'factura', '00002', 'A'),
  (10, 2, '00046003', 35,  'factura', '00011', 'B'),
  (11, 1, '00014129', 20,  'factura', '00003', 'A'),
  (12, 1, '00014388', 12,  'factura', '00003', 'A'),
  (13, 4, '00001204', 6,   'tique',   '00007', null)
) as c(id, prov, nro, dias, tipo, pv, letra);

insert into linea_compra (co_id_compra, rep_id, lc_nro_linea, lc_cantidad, lc_costo_unitario) values
  (1, 1, 1, 10, 18500), (1, 2, 2, 6, 16200), (1, 7, 3, 2, 42000),
  (2, 1, 1, 10, 19800), (2, 3, 2, 20, 3200),
  (3, 11, 1, 10, 5400), (3, 12, 2, 4, 38500), (3, 20, 3, 10, 6900),
  (4, 8, 1, 3, 54000), (4, 11, 2, 5, 5600),
  (5, 9, 1, 10, 7800), (5, 16, 2, 24, 2900), (5, 1, 3, 5, 17200),
  (6, 13, 1, 20, 6100), (6, 14, 2, 4, 15800),
  (7, 15, 1, 10, 21500), (7, 17, 2, 4, 18900),
  (8, 4, 1, 2, 285000), (8, 5, 2, 4, 36500),
  (9, 6, 1, 8, 9800),
  (10, 19, 1, 2, 98000), (10, 18, 2, 4, 12400), (10, 22, 3, 2, 26500),
  (11, 1, 1, 8, 21000), (11, 2, 2, 4, 17500),
  (12, 4, 1, 1, 299000), (12, 5, 2, 2, 38900),
  (13, 15, 1, 4, 22800);

update compras c
  set co_costo_total = (
    select sum(lc_cantidad * lc_costo_unitario) from linea_compra l where l.co_id_compra = c.co_id_compra
  );

-- Facturas move stock through their remitos (0013). Compra 9 is still
-- waiting for its remito; compra 12 arrived partially (the compresor is
-- still missing).
insert into remito_compra (rc_id, co_id_compra, rc_fecha, rc_p_id_registrador, rc_creado_en)
overriding system value
select id, co, current_date - dias, '00000000-0000-4000-8000-000000009000'::uuid,
       current_date - dias + time '15:30'
from (values (1, 1, 175), (2, 2, 146), (3, 3, 128), (4, 5, 99), (5, 7, 66),
             (6, 8, 53), (7, 10, 34), (8, 11, 19), (9, 12, 10)) as r(id, co, dias);

insert into remito_compra_linea (rc_id, co_id_compra, rep_id, rcl_cantidad)
select r.rc_id, l.co_id_compra, l.rep_id, l.lc_cantidad
  from remito_compra r
  join linea_compra l on l.co_id_compra = r.co_id_compra
  where r.co_id_compra <> 12;

insert into remito_compra_linea (rc_id, co_id_compra, rep_id, rcl_cantidad) values (9, 12, 5, 2);

insert into pedido_compra (
  ped_id_ped_compra, p_id_tecnico, co_id_compra, ped_fecha_solicitud, ped_estado,
  ped_observacion, ped_motivo_rechazo, ped_p_id_resolutor, ped_fecha_resolucion
) overriding system value
select id, tec, co, current_date - dias, estado::pedido_estado_t, obs, motivo,
       case when estado <> 'pendiente' then '00000000-0000-4000-8000-000000009000'::uuid end,
       case when resol is not null then current_date - resol end
from (values
  (1, '00000000-0000-4000-8000-000000009101'::uuid, 2,    150, 'recibido',  'Stock para los services de heladeras del próximo mes.', null, 146),
  (2, '00000000-0000-4000-8000-000000009103'::uuid, 4,    120, 'recibido',  'Resistencias de repuesto para los hornos de panadería.', null, 118),
  (3, '00000000-0000-4000-8000-000000009102'::uuid, null, 95,  'rechazado', 'El compresor de la cámara de lácteos hace ruido.', 'Se repara el compresor actual, no hace falta reemplazarlo.', 93),
  (4, '00000000-0000-4000-8000-000000009104'::uuid, 7,    70,  'recibido',  'Se está terminando el papel de las cajas.', null, 66),
  (5, '00000000-0000-4000-8000-000000009101'::uuid, 9,    40,  'aprobado',  'Filtros para la limpieza de los aires del salón.', null, 38),
  (6, '00000000-0000-4000-8000-000000009103'::uuid, null, 25,  'rechazado', 'Para el service anual del grupo electrógeno.', 'Hay stock suficiente en el depósito para el próximo service.', 24),
  (7, '00000000-0000-4000-8000-000000009101'::uuid, 12,   15,  'aprobado',  'Compresor de respaldo y termostatos para las cámaras.', null, 12),
  (8, '00000000-0000-4000-8000-000000009102'::uuid, null, 8,   'pendiente', 'Para terminar la carga de gas del aire del salón norte (tarea suspendida).', null, null),
  (9, '00000000-0000-4000-8000-000000009104'::uuid, null, 3,   'pendiente', 'Membranas de teclado para las balanzas de fiambrería y verdulería.', null, null)
) as p(id, tec, co, dias, estado, obs, motivo, resol);

insert into linea_pedido (ped_id_ped_compra, rep_id, lp_nro_linea, lp_cantidad) values
  (1, 1, 1, 10), (1, 3, 2, 20),
  (2, 8, 1, 3), (2, 11, 2, 5),
  (3, 4, 1, 2),
  (4, 15, 1, 10),
  (5, 6, 1, 8),
  (6, 13, 1, 10), (6, 14, 2, 2),
  (7, 4, 1, 1), (7, 5, 2, 2),
  (8, 2, 1, 6),
  (9, 17, 1, 2);

-- Ingresos/egresos outside compras and tareas (0048).
insert into movimiento_stock (
  ms_id, rep_id, ms_tipo, ms_cantidad, ms_motivo, ms_comentario, ms_p_id_registrador, ms_creado_en
) overriding system value
select id, rep, tipo, cant, motivo, coment, '00000000-0000-4000-8000-000000009000'::uuid,
       current_date - dias + time '12:00'
from (values
  (1, 16, 'ingreso', 4, 'Ajuste de inventario (sobrante)', null, 160),
  (2, 20, 'egreso',  2, 'Rotura o daño',                   null, 90),
  (3, 11, 'ingreso', 2, 'Compra por fuera del sistema',    null, 60),
  (4, 16, 'egreso',  3, 'Pérdida',                         null, 45),
  (5, 5,  'ingreso', 1, 'Devolución de repuesto',          null, 30),
  (6, 9,  'egreso',  1, 'Ajuste de inventario (faltante)', null, 14),
  (7, 12, 'egreso',  1, 'Otro', 'Se usó para el tendido eléctrico de la nueva heladera de congelados.', 5)
) as m(id, rep, tipo, cant, motivo, coment, dias);

-- ---------------------------------------------------------------------
-- 9. Notificaciones (the bell): preventive OTs and stock for every admin,
--    critical faults for the técnicos
-- ---------------------------------------------------------------------
insert into notificacion (user_id, no_tipo, ot_id_orden, no_leida, no_leida_en, no_creada_en)
select a.id, 'ot_preventiva', o.ot_id_orden,
       o.ot_estado = 'resolved',
       case when o.ot_estado = 'resolved' then o.ot_creada_en + interval '3 hours' end,
       o.ot_creada_en
  from orden_de_trabajo o
  cross join (select id from profiles where role = 'admin' and active) a
  where o.ot_tipo_orden = 'preventivo'
    and (o.ot_estado <> 'resolved' or o.ot_creada_en > now() - interval '6 days');

insert into notificacion (user_id, no_tipo, rep_id, no_cantidad, no_minimo, no_leida, no_leida_en, no_creada_en)
select a.id, n.tipo, n.rep, n.cant, n.minimo, n.leida,
       case when n.leida then now() - interval '4 days' end,
       now() - make_interval(days => n.dias)
  from (values
    ('stock_bajo', 2,  1, 3, false, 9),
    ('sin_stock',  6,  0, 4, false, 16),
    ('stock_bajo', 17, 1, 1, false, 3),
    ('stock_bajo', 4,  1, 1, true,  5)
  ) as n(tipo, rep, cant, minimo, leida, dias)
  cross join (select id from profiles where role = 'admin' and active) a;

-- One per técnico and critical OT (correctivo, Alta) with an unfinished
-- tarea of theirs, as notificar_tarea_falla_critica (0045) does.
insert into notificacion (user_id, no_tipo, ot_id_orden, no_leida, no_leida_en, no_creada_en)
select distinct on (t.p_id_tecnico, o.ot_id_orden)
       t.p_id_tecnico, 'falla_critica', o.ot_id_orden,
       o.ot_creada_en < now() - interval '1 day',
       case when o.ot_creada_en < now() - interval '1 day' then o.ot_creada_en + interval '1 hour' end,
       o.ot_creada_en + interval '5 minutes'
  from orden_de_trabajo o
  join tareas_realizadas_orden t on t.ot_id_orden = o.ot_id_orden
  where o.ot_tipo_orden = 'correctivo' and o.ot_prioridad = 'high'
    and t.taro_fecha_fin is null
  order by t.p_id_tecnico, o.ot_id_orden;

-- ---------------------------------------------------------------------
-- 10. Triggers back on, derived state and identity sequences
-- ---------------------------------------------------------------------
alter table orden_de_trabajo enable trigger user;
alter table tareas_realizadas_orden enable trigger user;
alter table solicitudes enable trigger user;
alter table repuestos enable trigger user;
alter table tareas_generales enable trigger user;
alter table tarea_prevista_plan enable trigger user;
alter table equipo enable trigger user;
alter table notificacion enable trigger user;

do $$
declare
  r record;
begin
  for r in select eq_id_equipo from equipo loop
    perform sync_equipo_estado(r.eq_id_equipo);
  end loop;

  -- Rows were inserted with explicit ids: move every sequence past them
  -- so the app's next insert doesn't collide.
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and (c.is_identity = 'YES' or c.column_default like 'nextval(%')
  loop
    execute format(
      'select setval(pg_get_serial_sequence(%L, %L), coalesce((select max(%I) from public.%I), 0) + 1, false)',
      'public.' || r.table_name, r.column_name, r.column_name, r.table_name
    );
  end loop;
end;
$$;

commit;

-- What got loaded.
select 'Usuarios' as que, count(*)::text as cantidad from profiles
union all select 'Equipos', count(*)::text from equipo
union all select 'Planes de mantenimiento', count(*)::text from plan_mantenimiento
union all select 'Solicitudes', count(*)::text from solicitudes
union all select 'OT correctivas', count(*)::text from orden_de_trabajo where ot_tipo_orden = 'correctivo'
union all select 'OT preventivas', count(*)::text from orden_de_trabajo where ot_tipo_orden = 'preventivo'
union all select 'OT de instalación', count(*)::text from orden_de_trabajo where ot_tipo_orden = 'instalacion'
union all select 'OT abiertas', count(*)::text from orden_de_trabajo where ot_estado <> 'resolved'
union all select 'Tareas', count(*)::text from tareas_realizadas_orden
union all select 'Eventos de historial', count(*)::text from historial
union all select 'Compras', count(*)::text from compras
union all select 'Pedidos de compra', count(*)::text from pedido_compra
union all select 'Notificaciones', count(*)::text from notificacion;
