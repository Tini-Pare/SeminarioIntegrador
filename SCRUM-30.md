# SCRUM-30 — Registrar solicitud para reportar un fallo

[*] Rama SCRUM-30 creada
[*] Código actual analizado
[*] Botón Reportar falla analizado
[*] Modelo de Solicitud revisado
[*] Persistencia implementada
[*] Formulario implementado
[*] Validaciones implementadas
[*] Flujo probado
[*] Tests/build ejecutados
[*] Cambios listos para revisión

## Detalles técnicos

- La implementación reutiliza la tabla `solicitudes`, el modal `ReportFaultModal` y la capa `queries/faults.ts` existentes.
- El catálogo `fallo` permanece sin relación directa con `solicitudes`: el modelo actual lo reserva para su asociación posterior con órdenes de trabajo, mientras que el reporte inicial guarda la descripción libre en `sol_descripcion`.
- `0009_scrum30_solicitud_reporte_falla.sql` impide descripciones vacías y limita la inserción a perfiles activos que reportan en su propio nombre.
- El flujo conserva la foto opcional, la urgencia y el registro automático en `historial` ya soportados por el modelo actual.
- Las pruebas cubren la persistencia de la solicitud, usuario de sesión, validaciones de entrada, sincronización del estado del equipo y registro del historial.
- La verificación manual autenticada queda disponible en el servidor web local; no se incluyen credenciales ni datos de prueba en el repositorio.
