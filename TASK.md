[*] SCRUM-57 Modificar tareas generales
[*] SCRUM-14 Inhabilitar tareas generales
[*] SCRUM-15 Alta de fallas genéricas
[*] SCRUM-16 Inhabilitar fallas genéricas
[] Build y verificaciones finales

## Detalles técnicos

- Las tareas generales usan `tareas_generales.tag_activo` para la baja lógica.
- Las fallas genéricas usan `fallo.fa_activo` para la baja lógica.
- Las acciones administrativas usan las políticas RLS existentes.
- La modificación de fallas genéricas (SCRUM-17) queda fuera de alcance.
- `npx jest --runInBand`, `npx tsc --noEmit` y `npx expo export --platform web` pasan.
- `npx expo lint` queda pendiente porque el repositorio no tiene configuración ESLint y Expo falla al autoinstalarla.
