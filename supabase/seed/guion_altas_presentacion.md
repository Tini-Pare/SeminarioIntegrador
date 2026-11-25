# Guion de altas para la presentación

Ejemplos listos para crear en vivo sobre la base demo
(`demo_reset_y_datos.sql`). Ninguno choca con los datos que ya carga el
script, así que se pueden crear tal cual. Si hay que repetir el ensayo,
volver a correr el script deja todo como al principio (también borra lo que
se haya creado acá).

Todas las cuentas demo usan la contraseña **Demo1234**.

| Legajo | Quién           | Rol     |
| ------ | --------------- | ------- |
| 9000   | Laura Méndez    | admin   |
| 9101   | Martín Gómez    | técnico |
| 9103   | Diego Fernández | técnico |
| 9201   | Ana Torres      | usuario |

La historia que cuentan los pasos: el súper abre una **rotisería**, compra
dos freidoras (una ya instalada y otra por instalar), les arma su plan de
mantenimiento, una se rompe, se repara y se compra el repuesto que faltaba.

---

## Parte 1 — Catálogos (admin, legajo 9000)

### 1. Ubicación — Ubicaciones → Agregar

| Campo  | Valor     |
| ------ | --------- |
| Sector | Rotisería |
| Piso   | PB        |

### 2. Tipo de equipo — Tipos de equipo → Agregar

| Campo  | Valor               |
| ------ | ------------------- |
| Nombre | Freidora industrial |

### 3. Tareas genéricas — Tareas → Agregar (dos)

| Nombre                          | Descripción                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| Cambio de aceite de freidora    | Vaciado, filtrado y reposición del aceite. Limpieza del canasto.    |
| Limpieza de cuba y resistencias | Desengrasado de la cuba y de las resistencias con la freidora fría. |

### 4. Falla genérica — Fallas → Agregar

| Campo                   | Valor                                     |
| ----------------------- | ----------------------------------------- |
| Nombre                  | Sobrecalentamiento del aceite             |
| Descripción de la falla | El termostato no corta y el aceite humea. |
| Gravedad                | Alta                                      |

### 5. Repuesto — Repuestos → Agregar

| Campo            | Valor                    |
| ---------------- | ------------------------ |
| Nombre           | Termostato para freidora |
| Unidad de medida | Unidad                   |
| Stock mínimo     | 1                        |
| Stock máximo     | 4                        |

Nace con stock 0: entra con la compra del paso 13.

### 6. Proveedor — Proveedores → Agregar

| Campo    | Valor                      |
| -------- | -------------------------- |
| Nombre   | Gastro Equipos del Sur SRL |
| Rubro    | Equipamiento gastronómico  |
| CUIT     | 30-71888999-1              |
| Teléfono | 011 4555-2020              |
| Correo   | ventas@gastrosur.com.ar    |

El CUIT tiene el dígito verificador correcto: si se tipea mal, el formulario
lo rechaza (sirve para mostrar la validación).

---

## Parte 2 — Equipos y planes (admin)

### 7. Equipo ya instalado — Equipos → Agregar equipo

| Campo                         | Valor                 |
| ----------------------------- | --------------------- |
| Código                        | FRE-001               |
| Modelo                        | Fritec FI-20          |
| Nombre                        | Freidora industrial 1 |
| Tipo                          | Freidora industrial   |
| Ubicación                     | Rotisería             |
| ¿El equipo ya está instalado? | Sí                    |
| Fecha de instalación          | hace 10 días          |

### 8. Plan para el tipo nuevo — Planes de mantenimiento → Nuevo plan

| Campo                     | Valor                                                         |
| ------------------------- | ------------------------------------------------------------- |
| Nombre del plan           | Mantenimiento quincenal de freidoras                          |
| Tipo de equipo            | Freidora industrial                                           |
| Frecuencia (días)         | 15                                                            |
| Plazo de ejecución (días) | 2                                                             |
| Estado                    | Activo                                                        |
| Descripción               | Cambio de aceite y limpieza de cuba de las freidoras.         |
| Tareas previstas          | Cambio de aceite de freidora, Limpieza de cuba y resistencias |

Qué mostrar: FRE-001 entra solo al plan desde su fecha de instalación, y
como hace 10 días que se instaló, su próximo mantenimiento es en 5 días.
Si se pone un plazo mayor a la frecuencia (por ejemplo 20), el formulario
avisa que no puede.

### 9. Plan que genera su OT en el momento — Planes de mantenimiento → Nuevo plan

El autoelevador (AUT-001) es el único equipo de la demo sin plan.

| Campo                     | Valor                                      |
| ------------------------- | ------------------------------------------ |
| Nombre del plan           | Revisión mensual del autoelevador          |
| Tipo de equipo            | Autoelevador                               |
| Frecuencia (días)         | 30                                         |
| Plazo de ejecución (días) | 3                                          |
| Estado                    | Activo                                     |
| Descripción               | Control de batería, cargador y conectores. |
| Tareas previstas          | Revisión de batería y cargador             |

Qué mostrar: como el autoelevador nunca tuvo mantenimiento, al confirmar se
genera sola la OT preventiva (si son más de las 8:00), con fecha requerida
de cierre en 3 días, asignada al técnico con menos tareas, y le llega la
notificación al admin (campanita).

### 10. Equipo pendiente de instalación — Equipos → Agregar equipo

| Campo                                       | Valor                 |
| ------------------------------------------- | --------------------- |
| Código                                      | FRE-002               |
| Modelo                                      | Fritec FI-20          |
| Nombre                                      | Freidora industrial 2 |
| Tipo                                        | Freidora industrial   |
| Ubicación                                   | Rotisería             |
| ¿El equipo ya está instalado?               | No                    |
| Técnico que lo instala                      | Diego Fernández       |
| Prioridad de la instalación                 | Media                 |
| Fecha requerida de cierre de la instalación | dentro de 3 días      |

Qué mostrar: el equipo queda "Pendiente de instalación" y se crea su OT de
instalación. Entrar como **Diego (9103)**, iniciar y finalizar la tarea
"Instalación de equipo": el equipo pasa a operativo, queda con fecha de
instalación de hoy y se suma solo al plan de freidoras del paso 8 (se ve en
el historial del equipo y en el plan, que pasa a 2 equipos).

### 11. Usuarios — Usuarios → Invitar persona

| Legajo | Nombre           | Contraseña | Rol     |
| ------ | ---------------- | ---------- | ------- |
| 9207   | Matías Herrera   | Demo1234   | Usuario |
| 9106   | Florencia Castro | Demo1234   | Técnico |

Matías es el encargado de la rotisería: se usa en el paso 12.

---

## Parte 3 — Una falla de punta a punta

### 12. Reportar la falla — entrar como **Matías (9207)** → Reportar falla

| Campo       | Valor                                                          |
| ----------- | -------------------------------------------------------------- |
| Equipo      | FRE-001 · Freidora industrial 1                                |
| Descripción | La freidora 1 humea mucho y el aceite se pone negro enseguida. |
| Foto        | opcional (cualquier foto del celular)                          |

### 13. Generar la OT — entrar como **Laura (9000)** → Solicitudes → la de FRE-001 → Generar OT

| Campo                     | Valor                                             |
| ------------------------- | ------------------------------------------------- |
| Prioridad                 | Alta                                              |
| Fecha requerida de cierre | la que propone (mediana de las de prioridad Alta) |

En la pantalla de la OT:

- **Falla genérica:** Sobrecalentamiento del aceite.
- **+ Agregar tarea:** "Diagnóstico de falla" → Diego Fernández.

Qué mostrar: como es correctiva y Alta, es una **falla crítica**: a Diego le
llega la notificación y la ve destacada en su cola.

### 14. Registrar la compra del repuesto — Compras → Registrar compra

| Campo               | Valor                                               |
| ------------------- | --------------------------------------------------- |
| Tipo de comprobante | Factura                                             |
| Letra               | A                                                   |
| Punto de venta      | 00004                                               |
| Número              | 00000123                                            |
| Fecha               | hoy                                                 |
| Proveedor           | Gastro Equipos del Sur SRL                          |
| ¿Llegó con remito?  | Sí                                                  |
| Línea               | Termostato para freidora · cantidad 2 · costo 45000 |

Qué mostrar: con remito el stock entra en el momento (Repuestos: el
termostato pasa de 0 a 2). Con "No" queda pendiente de recepción y el remito
se carga después desde el detalle.

### 15. Reparar — entrar como **Diego (9103)** → Cola de trabajo → la OT de FRE-001

1. **Iniciar tarea** en "Diagnóstico de falla".
2. **Finalizar tarea** con:
   - Repuesto usado: Termostato para freidora · 1
   - Diagnóstico: Termostato pegado. Se reemplazó y se probó el corte a 180 °C.

Qué mostrar: la OT queda resuelta, la solicitud de Matías pasa a resuelta,
el equipo vuelve a operativo, el stock del termostato baja a 1 (llega al
mínimo y salta la notificación de stock bajo al admin) y todo queda en el
historial de FRE-001.

---

## Parte 4 — Otras altas cortas

### 16. Pedido de compra — entrar como **Martín (9101)** → Pedidos de compra → Nuevo

| Línea                        | Cantidad |
| ---------------------------- | -------- |
| Filtro de aire acondicionado | 6        |
| Gas refrigerante R134a       | 4        |

Observación: _Para la limpieza de filtros de los aires del salón._

Después, como **Laura**, aprobarlo o rechazarlo (el rechazo pide motivo).

### 17. Movimiento de stock — Movimientos de stock → Registrar

| Tipo    | Repuesto                    | Cantidad | Motivo                 |
| ------- | --------------------------- | -------- | ---------------------- |
| Egreso  | Lámpara LED para exhibidora | 1        | Rotura o daño          |
| Ingreso | Guantes de seguridad        | 5        | Devolución de repuesto |

### 18. Cerrar una solicitud sin OT — Solicitudes → la de BAL-004 (balanza de verdulería)

Cerrar sin orden de trabajo → motivo _Se resolvió sin OT (ajuste menor)_.

---

## Ya cargado para mostrar sin crear nada

- **Inicio:** OT vencidas (correctivas y preventivas), solicitudes a atender,
  stock bajo el mínimo y carga de tareas por técnico.
- **Solicitudes pendientes:** heladera de carnes (HEL-004), aire de oficinas
  (AIR-003) y balanza de verdulería (BAL-004).
- **OT crítica sin empezar:** cámara de carnes (CAM-001), de Martín.
- **Tarea suspendida por falta de repuestos:** aire del salón norte
  (AIR-001), con su pedido de compra pendiente de Sofía.
- **OT sin tareas:** freezer de helados (FRZ-001), para mostrar "+ Agregar tarea".
- **Instalación pendiente:** heladera de congelados (HEL-007), de Martín.
- **Compras:** una factura pendiente de recepción (filtros de aire) y otra
  recibida a medias (falta el compresor), para cargar el remito que falta.
- **Estadísticas:** 6 meses de historia en las 5 pestañas, con exportación a PDF.
