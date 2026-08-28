# Mantia CMMS

Sistema de gestión de mantenimiento: equipos, fallas reportadas, cola de trabajo técnico. Mobile-first (técnicos reportan desde el celular en planta), misma base de código para iOS/Android/Web.

**Convención de idioma:** código (tablas, columnas, funciones, variables) en inglés. Todo lo que se muestra en la UI, en español.

## Stack

- **Expo SDK 54** (React Native + Expo Router) — una sola base de código para iOS, Android y Web.
- **Supabase** — Auth, Postgres con RLS, Realtime, Storage (fotos de falla), dos Edge Functions para operaciones que requieren privilegios de admin.
- **expo-image-picker** + **expo-image-manipulator** — foto de falla comprimida a webp en el dispositivo antes de subir (detalle en "Storage" abajo).

**Por qué SDK 54 y no 57:** Expo Go para SDK 57 todavía no está en el App Store para todos los dispositivos — bloqueaba probar en celulares físicos. Si se sube de nuevo, revisar `app.json` (plugins `expo-status-bar`/`ios.icon` se sacaron durante el debug de SDK 57).

## Setup

1. Instalar **Node.js LTS** (v20 o superior) — incluye `npm`.
2. `npm install` (desde la raíz del repo — no hay subcarpeta `mantia/`).
3. Crear `.env` en la raíz con las credenciales de Supabase:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key: sb_publishable_...>
   ```
   Salen del dashboard de Supabase (Project Settings → API Keys). `supabase/SETUP.md`
   explica cómo armar el proyecto Supabase desde cero.
4. `npx expo start --web` para el navegador, o `npx expo start` y escanear el QR
   con **Expo Go** en el celular (SDK 54 — ver nota abajo).

## Estructura

```
src/
  app/
    _layout.tsx               # chequea sesión en cada ruta
    index.tsx                 # redirección inicial
    (auth)/login.tsx
    (app)/                    # rutas autenticadas
      _layout.tsx             # sidebar (desktop) / bottom-bar (mobile), menú de cuenta
      equipment/              # listado + detalle (fallas/historial)
      equipment-types/        # ABM de tipos de equipo (admin)
      fault-types/            # ABM de fallas genéricas (admin)
      general-tasks/          # ABM de tareas generales (admin)
      locations/              # Ubicaciones (admin)
      requests/               # Solicitudes (admin) / Mis solicitudes (usuario)
      queue/                  # Cola de trabajo (técnico)
      users/                  # Usuarios y roles (admin)
      settings/               # perfil + cambiar contraseña
  components/                 # modales, cards, AutocompleteInput, AccountMenu
  constants/                  # constantes compartidas de la UI
  lib/
    supabase.ts               # cliente Supabase (lee las env vars EXPO_PUBLIC_*)
    auth.ts, faultPhoto.ts, locationColor.ts
    ThemeContext.tsx, theme.ts # tema claro/oscuro
    queries/                  # todo el acceso a Supabase pasa por acá
    __tests__/
  types/database.ts           # tipos TS a mano, espejan el schema SQL
assets/
  screenshots/
    index.html                # guía visual: qué ve/hace cada rol (user/technician/admin), con capturas
supabase/
  migrations/                 # correr 0001 y después 0003 (0002 es solo referencia)
  functions/invite-user/, delete-user/
  SETUP.md                    # armar el proyecto Supabase desde cero
```

## Navegación (Expo Router)

`src/app/_layout.tsx` chequea sesión en cada ruta: sin sesión → `/login`, con sesión en `/login` → `/equipment`. `src/app/(app)/_layout.tsx` envuelve todo lo autenticado con el nav (filtrado por rol) y el menú de cuenta (avatar → Configuración / Cerrar sesión).

Equipos (`equipment/index.tsx`) se re-fetchea al ganar foco y está suscrito a Realtime — cambios de otros usuarios se ven sin recargar. El detalle (`equipment/[id].tsx`) igual, filtrado por ese equipo.

## Capa de datos (`src/lib/`)

Las pantallas nunca llaman a `supabase.from(...)` directo — siempre pasan por una función de `lib/queries/`. Todas tiran (`throw`) si Supabase devuelve error. Los tests en `lib/__tests__/` mockean `supabase.ts` y no pegan contra la base real.

- **`auth.ts`**: `signIn`, `signOut`, `getProfile()`, `changePassword()` — el rol vive en `profiles.role`, nunca en JWT claims.
- **`queries/equipment.ts`**: CRUD de `equipo` + fallas/historial por equipo. `te_id`/`lu_codigo` se pasan como ids (los modales usan `<Select>` contra los catálogos, no texto libre). `eq_estado` no se puede setear a mano — lo recalcula la RPC `sync_equipo_estado` cada vez que cambia una solicitud/orden.
- **`queries/equipmentTypes.ts`**: CRUD de `tipos_de_equipos` (pantalla Tipos de equipo), con conteo de equipos por tipo calculado en el cliente.
- **`queries/generalTasks.ts`**: CRUD de `tareas_generales` (pantalla Tareas generales). El borrado tiene guarda de FK (23503): no se puede eliminar una tarea usada en un plan u orden.
- **`queries/faultTypes.ts`**: CRUD de `fallo` (pantalla Fallas genéricas). `fa_gravedad` se guarda como `low`/`medium`/`high` (Spanish en la UI). Borrado con guarda de FK.
- **`queries/faults.ts`**: reportar/asignar/avanzar fallas sobre `solicitudes` + `orden_de_trabajo`. Cada paso (reportar/asignar/iniciar/resolver) también escribe en `historial` vía `logHistorial()` — es el timeline del tab Historial.
- **`queries/locations.ts`**: CRUD de `lugares` (pantalla Ubicaciones).
- **`queries/profiles.ts`**: `listProfiles`, `updateProfile`.
- **`faultPhoto.ts`**: pick/take → `compressToWebp` (resize 1600px, webp, `data:` URI en base64) → `uploadFaultPhoto` (decode + sube a Storage). Ver nota abajo sobre por qué `data:` y no `blob:`.

## Base de datos

Migraciones en `supabase/migrations/`, se corren a mano en el SQL Editor del dashboard
(ver `SETUP.md`). Orden: **`0001_init.sql`**, después **`0003_reemplazo_gestion_mantenimiento.sql`**.
`0002_gestion_mantenimiento.sql` es solo el modelo de referencia del que se adaptó 0003 —
no se corre.

- **0001** deja `profiles` (identidad + rol, sobre Supabase Auth), `current_role_name()`,
  el bucket de Storage `fault-photos` y los enums base. Sus tablas en inglés
  (`equipment`/`faults`/`history`/`maintenance_plan`) las reemplaza 0003.
- **0003** trae el modelo de gestión de mantenimiento con nombres en español.

| Tabla                                   | Qué guarda                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `profiles`                              | Perfil por usuario. `role` (`admin`\|`technician`\|`user`), `area`, `active`.                                 |
| `lugares`, `tipos_de_equipos`           | Catálogos para clasificar equipos por sector y tipo.                                                          |
| `tareas_generales`                      | Catálogo de acciones técnicas estándar (ABM Tareas generales: alta/edición/borrado).                         |
| `fallo`                                 | Catálogo de tipos de falla (`fa_nombre`, `fa_desperfecto`, `fa_gravedad`). ABM Fallas genéricas.             |
| `equipo`                                | `eq_codigo`, `eq_nombre`, tipo, ubicación, `eq_estado` (solo lectura, lo calcula `sync_equipo_estado`).      |
| `solicitudes`                           | Reporte inicial de falla: equipo, quién reporta, descripción, urgencia, foto, estado.                        |
| `orden_de_trabajo`                      | Se crea cuando un técnico toma una solicitud. Responsable, tipo, fechas, estado, prioridad.                  |
| `historial`                             | Log de eventos por equipo — se completa solo en cada paso de una falla (reportar/asignar/iniciar/resolver).  |
| resto del schema de 0003                | Planes de mantenimiento preventivo, proveedores, compras, repuestos — **sin UI todavía**, RLS admin-only. |

**RLS + grants:** lectura amplia para cualquier autenticado en `equipment`/`history`/`maintenance_plan`/`profiles` (necesario para resolver nombres de otros usuarios en Historial/Solicitudes — restringir `profiles` a "uno mismo" dejaba a cualquiera que no fuera admin/technician viendo "Desconocido"). `faults` sí está restringido a dueño/asignado/admin-technician. Postgres exige `GRANT` de tabla además de la policy — sin el grant a `service_role` sobre `profiles`, las Edge Functions fallan con "Forbidden" aunque el caller sea admin real. Todo esto ya está en la migración.

**Realtime:** `equipo`, `solicitudes` y `orden_de_trabajo` están en la publication `supabase_realtime`. Las pantallas abren un canal (`supabase.channel(...).on("postgres_changes", ...)`) y listo — no hay botones de refresh manual en esas pantallas.

**Storage (fotos de falla):** bucket `fault-photos` (lectura pública, escritura autenticada). El flujo comprime a webp y sube en base64 en vez de `blob:` + `fetch` — Safari en iOS devuelve blobs de 0 bytes silenciosamente con ese patrón, así que se evita por completo.

**Edge Functions:** `invite-user` (admin crea cuenta con email+password directo) y `delete-user` (bloqueado para otros admins). Ambas necesitan el secret `SB_SECRET_KEY` y "Verify JWT with legacy secret" desactivado — ver `SETUP.md`.

## Roles

| Rol          | Qué ve/hace                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `user`       | Equipos, reportar falla, Mis solicitudes.                                                               |
| `technician` | Equipos, reportar falla, Cola de trabajo (asignarse/avanzar estado).                                    |
| `admin`      | Todo lo anterior + Usuarios (invitar/editar/desactivar/eliminar), Solicitudes (todas), CRUD de equipos, ABM de Ubicaciones, Tipos de equipo, Tareas generales y Fallas genéricas. |

El rol se lee siempre con `getProfile()` → `profiles.role`, nunca de JWT claims. Los permisos están reforzados en RLS, no son solo UI oculta — un `user` que le pegue directo a Supabase para editar equipos recibe error de permisos igual. Un admin no puede auto-degradarse ni desactivarse a sí mismo desde Usuarios (guard explícito).

## Testing

`jest` + `jest-expo`. Tests en `src/lib/__tests__/` prueban la capa de datos mockeando `supabase.ts`. No hay tests de UI automatizados — se verifica manualmente contra el dev server real.

## Pendiente / fuera de alcance

- Push notifications, modo offline.
- **Mantenimiento preventivo**: `maintenance_plan` y `equipment.last_maintenance`/`next_maintenance` existen en el schema pero no hay UI para cargarlos — se sacaron Calendario y el tab "Mantenimiento" del detalle de equipo porque quedaban siempre vacíos. Falta: UI de alta/edición de tareas.

## Troubleshooting

- **"Forbidden — admin only" al invitar/eliminar usuarios siendo admin real** → falta `grant select, insert, update, delete on profiles to service_role;` (ya está en la migración, correrla de nuevo si el proyecto es viejo).
- **"permission denied for table X"** → falta el `GRANT` a `authenticated` correspondiente, ver sección RLS.
- **Invite/delete devuelven CORS error** → la Edge Function necesita `apikey` en `Access-Control-Allow-Headers` (ya está en el código).
- **Expo Go dice "Project is incompatible"** → el SDK del proyecto no tiene Expo Go publicado para esa versión de iOS todavía; no es problema del dispositivo.
- **Foto de falla sube pero pesa 0 bytes (iPhone/Safari)** → ya resuelto (ver "Storage" arriba); si reaparece, algo reintrodujo `fetch` sobre un `blob:`/`file:` URI.
- **Equipos no se actualiza solo entre pestañas/usuarios** → confirmá que `equipo`/`solicitudes`/`orden_de_trabajo` estén en la publication `supabase_realtime` (están en la migración 0003; sin eso las suscripciones se conectan pero nunca reciben eventos, sin error visible).
- **`supabase db push` falla con error de red/IPv6** → aplicar el SQL manual vía el SQL Editor del dashboard.
