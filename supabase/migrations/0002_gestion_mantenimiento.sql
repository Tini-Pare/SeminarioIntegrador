-- =====================================================================
-- MODELO: Gestion de Mantenimiento de Equipos
-- Adaptado de un script generico (MySQL/SQL Server style) a PostgreSQL
-- para Supabase. Unico cambio de tipo necesario: DATETIME -> timestamptz
-- (Postgres no tiene el tipo DATETIME). Todo lo demas (INT, VARCHAR,
-- DECIMAL, DATE, PRIMARY KEY, FOREIGN KEY, CHECK) ya es SQL estandar
-- valido en Postgres.
--
-- Identificadores en minusculas: Postgres pliega los identificadores sin
-- comillas a minusculas de forma silenciosa (TE_id -> te_id), asi que se
-- escriben directamente en minusculas para que coincida con lo que
-- realmente se usa al consultar via PostgREST/el cliente de Supabase.
--
-- Las PK son enteros asignados a mano (no hay AUTO_INCREMENT en el
-- script original), asi que se mantienen como "int" simple: cada INSERT
-- debe indicar el id explicitamente. Si se prefiere que Postgres genere
-- los ids automaticamente, cambiar "int primary key" por
-- "int generated always as identity primary key" en cada tabla.
--
-- Este script no incluye RLS ni grants: es el modelo de datos "crudo".
-- Si se va a exponer via la API de Supabase, agregar RLS/policies aparte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- tipos_de_equipos
-- ---------------------------------------------------------------------
create table tipos_de_equipos (
    te_id       int primary key,
    te_nombre   varchar(100) not null,
    te_cantidad int
);

-- ---------------------------------------------------------------------
-- lugares
-- ---------------------------------------------------------------------
create table lugares (
    lu_codigo        int primary key,
    lu_nombre_sector varchar(100) not null,
    lu_piso          varchar(20)
);

-- ---------------------------------------------------------------------
-- equipo
-- ---------------------------------------------------------------------
create table equipo (
    eq_id_equipo         int primary key,
    te_id                int not null,
    lu_codigo            int not null,
    eq_nombre            varchar(100) not null,
    eq_fecha_garantia    date,
    eq_estado            varchar(50),
    eq_modelo            varchar(100),
    eq_fecha_instalacion date,
    constraint fk_equipo_tipo
        foreign key (te_id) references tipos_de_equipos(te_id),
    constraint fk_equipo_lugar
        foreign key (lu_codigo) references lugares(lu_codigo)
);

-- ---------------------------------------------------------------------
-- personal
-- ---------------------------------------------------------------------
-- NOTA: p_legajo y p_clave son las credenciales para loguearse.
-- p_legajo es ademas el identificador de cada persona del personal.
create table personal (
    p_legajo   int primary key,
    p_nombre   varchar(100) not null,
    p_telefono varchar(30),
    p_rol      varchar(50),
    p_clave    varchar(255) not null
);

-- ---------------------------------------------------------------------
-- tecnico_interno (especializacion de personal)
-- ---------------------------------------------------------------------
create table tecnico_interno (
    p_legajo        int primary key,
    ti_estado       varchar(50),
    ti_especialidad varchar(100),
    ti_turno        varchar(50),
    constraint fk_tecnico_personal
        foreign key (p_legajo) references personal(p_legajo)
);

-- ---------------------------------------------------------------------
-- especialidades_externo
-- ---------------------------------------------------------------------
create table especialidades_externo (
    ee_id          int primary key,
    ee_nombre      varchar(100) not null,
    ee_descripcion varchar(255)
);

-- ---------------------------------------------------------------------
-- prestador_externo
-- ---------------------------------------------------------------------
create table prestador_externo (
    pe_cuit_cuil varchar(20) primary key,
    ee_id        int not null,
    pe_nombre    varchar(100) not null,
    pe_email     varchar(100),
    pe_contacto  varchar(100),
    constraint fk_prestador_especialidad
        foreign key (ee_id) references especialidades_externo(ee_id)
);

-- ---------------------------------------------------------------------
-- tipos_proveedores
-- ---------------------------------------------------------------------
create table tipos_proveedores (
    tp_id           int primary key,
    tp_nombre_rubro varchar(100) not null,
    tp_descripcion  varchar(255)
);

-- ---------------------------------------------------------------------
-- proveedores
-- ---------------------------------------------------------------------
create table proveedores (
    prov_id_proveedor int primary key,
    tp_id             int not null,
    prov_nombre       varchar(100) not null,
    prov_telefono     varchar(30),
    prov_correo       varchar(100),
    constraint fk_proveedor_tipo
        foreign key (tp_id) references tipos_proveedores(tp_id)
);

-- ---------------------------------------------------------------------
-- compras
-- ---------------------------------------------------------------------
create table compras (
    co_id_compra      int primary key,
    prov_id_proveedor int not null,
    co_garantia       varchar(100),
    co_nombre         varchar(100),
    co_fecha_compra   date,
    co_costo_total    decimal(12,2),
    constraint fk_compra_proveedor
        foreign key (prov_id_proveedor) references proveedores(prov_id_proveedor)
);

-- ---------------------------------------------------------------------
-- repuestos
-- ---------------------------------------------------------------------
create table repuestos (
    rep_id              int primary key,
    rep_nombre          varchar(100) not null,
    rep_cantidad_actual int,
    rep_stock_minimo    int,
    rep_stock_maximo    int,
    rep_estado          varchar(50)
);

-- ---------------------------------------------------------------------
-- linea_compra (detalle de compras)
-- ---------------------------------------------------------------------
create table linea_compra (
    co_id_compra      int not null,
    rep_id            int not null,
    lc_nro_linea      int,
    lc_cantidad       int,
    lc_costo_unitario decimal(12,2),
    primary key (co_id_compra, rep_id),
    constraint fk_lineacompra_compra
        foreign key (co_id_compra) references compras(co_id_compra),
    constraint fk_lineacompra_repuesto
        foreign key (rep_id) references repuestos(rep_id)
);

-- ---------------------------------------------------------------------
-- plan_mantenimiento
-- ---------------------------------------------------------------------
create table plan_mantenimiento (
    pm_id_plan          int primary key,
    pm_nombre_plan      varchar(100) not null,
    pm_descripcion_plan varchar(255),
    pm_frecuencia       varchar(50),
    pm_estado           varchar(50)
);

-- ---------------------------------------------------------------------
-- mantenimiento_equipo (plan_mantenimiento <-> tipos_de_equipos)
-- ---------------------------------------------------------------------
create table mantenimiento_equipo (
    pm_id_plan             int not null,
    te_id                  int not null,
    me_fecha_mantenimiento date,
    primary key (pm_id_plan, te_id),
    constraint fk_mantequipo_plan
        foreign key (pm_id_plan) references plan_mantenimiento(pm_id_plan),
    constraint fk_mantequipo_tipo
        foreign key (te_id) references tipos_de_equipos(te_id)
);

-- ---------------------------------------------------------------------
-- tareas_generales
-- ---------------------------------------------------------------------
create table tareas_generales (
    tag_id_tarea          int primary key,
    tag_nombre_tarea      varchar(100) not null,
    tag_descripcion_tarea varchar(255)
);

-- ---------------------------------------------------------------------
-- tarea_prevista_plan (tareas_generales <-> plan_mantenimiento)
-- ---------------------------------------------------------------------
create table tarea_prevista_plan (
    tag_id_tarea int not null,
    pm_id_plan   int not null,
    primary key (tag_id_tarea, pm_id_plan),
    constraint fk_tareaprevista_tarea
        foreign key (tag_id_tarea) references tareas_generales(tag_id_tarea),
    constraint fk_tareaprevista_plan
        foreign key (pm_id_plan) references plan_mantenimiento(pm_id_plan)
);

-- ---------------------------------------------------------------------
-- solicitudes
-- ---------------------------------------------------------------------
create table solicitudes (
    sol_id_solicitud     int primary key,
    p_legajo_admin       int not null,
    p_legajo_solicitante int not null,
    eq_id_equipo         int not null,
    sol_fecha_hora       timestamptz,
    sol_descripcion      varchar(255),
    sol_estado           varchar(50),
    constraint fk_solicitud_admin
        foreign key (p_legajo_admin) references personal(p_legajo),
    constraint fk_solicitud_solicitante
        foreign key (p_legajo_solicitante) references personal(p_legajo),
    constraint fk_solicitud_equipo
        foreign key (eq_id_equipo) references equipo(eq_id_equipo)
);

-- ---------------------------------------------------------------------
-- orden_de_trabajo
-- ---------------------------------------------------------------------
-- NOTA: plan_id_manequipo se modela como referencia a plan_mantenimiento
-- (pm_id_plan), ya que mantenimiento_equipo tiene clave compuesta y un
-- solo campo no puede apuntar a ella. Revisar si esta suposicion es correcta.
create table orden_de_trabajo (
    ot_id_orden       int primary key,
    sol_id_solicitud  int null,
    plan_id_manequipo int null,
    eq_id_equipo      int not null,
    p_legajo_admin    int not null,
    ot_tipo_orden     varchar(50),
    ot_fecha_inicio   date,
    ot_fecha_fin      date,
    ot_observacion    varchar(255),
    ot_estado         varchar(50),
    ot_prioridad      varchar(50),
    constraint fk_ot_solicitud
        foreign key (sol_id_solicitud) references solicitudes(sol_id_solicitud),
    constraint fk_ot_plan
        foreign key (plan_id_manequipo) references plan_mantenimiento(pm_id_plan),
    constraint fk_ot_equipo
        foreign key (eq_id_equipo) references equipo(eq_id_equipo),
    constraint fk_ot_admin
        foreign key (p_legajo_admin) references personal(p_legajo)
);

-- ---------------------------------------------------------------------
-- fallo
-- ---------------------------------------------------------------------
create table fallo (
    fa_id_fallo    int primary key,
    fa_nombre      varchar(100) not null,
    fa_desperfecto varchar(255),
    fa_gravedad    varchar(50)
);

-- ---------------------------------------------------------------------
-- fallo_por_orden (fallo <-> orden_de_trabajo)
-- ---------------------------------------------------------------------
create table fallo_por_orden (
    fa_id_fallo         int not null,
    ot_id_orden         int not null,
    fpo_fecha_deteccion date,
    primary key (fa_id_fallo, ot_id_orden),
    constraint fk_falloorden_fallo
        foreign key (fa_id_fallo) references fallo(fa_id_fallo),
    constraint fk_falloorden_ot
        foreign key (ot_id_orden) references orden_de_trabajo(ot_id_orden)
);

-- ---------------------------------------------------------------------
-- tareas_realizadas_orden
-- ---------------------------------------------------------------------
-- RESTRICCION DEL MODELO: p_legajo_tecnico puede ser NULL, pe_cuit_cuil
-- puede ser NULL, pero NO pueden ser NULL los dos a la vez, y NO pueden
-- estar cargados los dos a la vez (exactamente uno de los dos debe estar
-- completo: XOR).
create table tareas_realizadas_orden (
    taro_id_tarea_orden int primary key,
    ot_id_orden         int not null,
    tag_id_tarea        int not null,
    pe_cuit_cuil        varchar(20) null,
    p_legajo_tecnico    int null,
    taro_fecha_inicio   date,
    taro_fecha_fin      date,
    constraint fk_tareo_ot
        foreign key (ot_id_orden) references orden_de_trabajo(ot_id_orden),
    constraint fk_tareo_tarea
        foreign key (tag_id_tarea) references tareas_generales(tag_id_tarea),
    constraint fk_tareo_prestador
        foreign key (pe_cuit_cuil) references prestador_externo(pe_cuit_cuil),
    constraint fk_tareo_tecnico
        foreign key (p_legajo_tecnico) references tecnico_interno(p_legajo),
    constraint chk_tareo_responsable_xor
        check (
            (pe_cuit_cuil is not null and p_legajo_tecnico is null)
            or
            (pe_cuit_cuil is null and p_legajo_tecnico is not null)
        )
);

-- ---------------------------------------------------------------------
-- repuesto_para_tarea (tareas_realizadas_orden <-> repuestos)
-- ---------------------------------------------------------------------
create table repuesto_para_tarea (
    taro_id_tarea_orden int not null,
    rep_id              int not null,
    repta_canti_usada   int,
    repta_desc_uso      varchar(255),
    primary key (taro_id_tarea_orden, rep_id),
    constraint fk_repta_tarea
        foreign key (taro_id_tarea_orden) references tareas_realizadas_orden(taro_id_tarea_orden),
    constraint fk_repta_repuesto
        foreign key (rep_id) references repuestos(rep_id)
);

-- ---------------------------------------------------------------------
-- pedido_compra
-- ---------------------------------------------------------------------
create table pedido_compra (
    ped_id_ped_compra   int primary key,
    p_legajo_tecnico    int not null,
    co_id_compra        int null,
    ped_fecha_solicitud date,
    ped_estado          varchar(50),
    constraint fk_pedido_tecnico
        foreign key (p_legajo_tecnico) references personal(p_legajo),
    constraint fk_pedido_compra
        foreign key (co_id_compra) references compras(co_id_compra)
);

-- ---------------------------------------------------------------------
-- linea_pedido (detalle de pedido_compra)
-- ---------------------------------------------------------------------
create table linea_pedido (
    ped_id_ped_compra int not null,
    rep_id            int not null,
    lp_nro_linea      int,
    lp_cantidad       int,
    primary key (ped_id_ped_compra, rep_id),
    constraint fk_lineaped_pedido
        foreign key (ped_id_ped_compra) references pedido_compra(ped_id_ped_compra),
    constraint fk_lineaped_repuesto
        foreign key (rep_id) references repuestos(rep_id)
);
