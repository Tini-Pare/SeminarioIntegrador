-- =====================================================================
-- Proveedores — CUIT
--
-- La pantalla de "Registrar compra" (0011) muestra el CUIT del proveedor
-- elegido como dato de solo lectura junto al selector de proveedor. Sin
-- esta columna ese campo no tendría de dónde salir.
--
-- Idempotente: columna con "if not exists".
-- =====================================================================
alter table proveedores add column if not exists prov_cuit varchar(20);
