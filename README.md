# Mantia CMMS

Sistema de gestión de mantenimiento: equipos, fallas reportadas, cola de trabajo técnico. Mobile-first (técnicos reportan desde el celular en planta), misma base de código para iOS/Android/Web.

**Convención de idioma:** código (tablas, columnas, funciones, variables) en inglés. Todo lo que se muestra en la UI, en español.

## Stack

- **Expo SDK 54** (React Native + Expo Router) — una sola base de código para iOS, Android y Web.
- **Supabase** — Auth, Postgres con RLS, Realtime, Storage (fotos de falla), dos Edge Functions para operaciones que requieren privilegios de admin.
- **expo-image-picker** + **expo-image-manipulator** — foto de falla comprimida a webp en el dispositivo antes de subir (detalle en "Storage" abajo).

**Por qué SDK 54 y no 57:** Expo Go para SDK 57 todavía no está en el App Store para todos los dispositivos — bloqueaba probar en celulares físicos. Si se sube de nuevo, revisar `app.json` (plugins `expo-status-bar`/`ios.icon` se sacaron durante el debug de SDK 57).

## Setup

1. `cd mantia && npm install`
2. Crear `.env` desde `.env.example` con las credenciales de Supabase (ver `supabase/SETUP.md` para armar el proyecto desde cero).
3. `npx expo start --web` (o `--ios` / `--android` con Expo Go).

## Estructura

```
mantia/
  src/
    app/
      (auth)/login.tsx
      (app)/                    # rutas autenticadas
        _layout.tsx             # sidebar (desktop) / bottom-bar (mobile), menú de cuenta
        equipment/               # listado + detalle (fallas/historial)
        requests/                 # Solicitudes (admin) / Mis solicitudes (usuario)
        queue/                    # Cola de trabajo (técnico)
        users/                    # Usuarios y roles (admin)
        settings/                 # perfil + cambiar contraseña
    components/                 # modales, cards, AutocompleteInput, AccountMenu
    lib/
      auth.ts, faultPhoto.ts, locationColor.ts
      queries/                  # todo el acceso a Supabase pasa por acá
      __tests__/
    types/database.ts           # tipos TS a mano, espejan el schema SQL
  assets/
    screenshots/
      index.html                 # guía visual: qué ve/hace cada rol (user/technician/admin), con capturas
  supabase/
    migrations/0001_init.sql    # schema completo: tablas, RLS, storage, realtime
    functions/invite-user/, delete-user/
    SETUP.md                    # armar el proyecto Supabase desde cero
```

## Navegación (Expo Router)

`src/app/_layout.tsx` chequea sesión en cada ruta: sin sesión → `/login`, con sesión en `/login` → `/equipment`. `src/app/(app)/_layout.tsx` envuelve todo lo autenticado con el nav (filtrado por rol) y el menú de cuenta (avatar → Configuración / Cerrar sesión).

Equipos (`equipment/index.tsx`) se re-fetchea al ganar foco y está suscrito a Realtime — cambios de otros usuarios se ven sin recargar. El detalle (`equipment/[id].tsx`) igual, filtrado por ese equipo.

## Capa de datos (`src/lib/`)

Las pantallas nunca llaman a `supabase.from(...)` directo — siempre pasan por una función de `lib/queries/`. Todas tiran (`throw`) si Supabase devuelve error. Los tests en `lib/__tests__/` mockean `supabase.ts` y no pegan contra la base real.

- **`auth.ts`**: `signIn`, `signOut`, `getProfile()`, `changePassword()` — el rol vive en `profiles.role`, nunca en JWT claims.
- **`queries/equipment.ts`**: CRUD de equipos + `listFaultsByEquipment`/`listHistoryByEquipment`. `status` no se puede setear a mano — lo recalcula `sync_equipment_status` (RPC) cada vez que cambia una falla.
- **`queries/faults.ts`**: reportar/asignar/avanzar fallas. `createFault`, `assignToMe` y `advanceStatus` (iniciar/resolver) también escriben en `history` vía `logHistory()` — es todo el timeline que se ve en el tab Historial.
- **`queries/profiles.ts`**: `listProfiles`, `updateProfile`.
- **`faultPhoto.ts`**: pick/take → `compressToWebp` (resize 1600px, webp, `data:` URI en base64) → `uploadFaultPhoto` (decode + sube a Storage). Ver nota abajo sobre por qué `data:` y no `blob:`.

## Base de datos

Todo en `supabase/migrations/0001_init.sql` — un solo archivo, single source of truth.

| Tabla              | Qué guarda                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `profiles`         | Perfil por usuario. `role` (`admin`\|`technician`\|`user`), `area`, `active`.                                                 |
| `equipment`        | `code`, `name`, `type`, `location`, `status` (solo lectura, automático).                                                      |
| `faults`           | `equipment_id`, `reported_by`, `description`, `urgency`, `status`, `technician_id`, `photo_url`.                              |
| `history`          | Log de eventos por equipo — se completa solo en cada paso de una falla (reportar/asignar/iniciar/resolver, ver `logHistory`). |
| `maintenance_plan` | Sin UI todavía (ver "Pendiente" abajo) — tabla y RLS listas para cuando se construya.                                         |

También sin UI hoy: `equipment.last_maintenance`/`next_maintenance`.

**RLS + grants:** lectura amplia para cualquier autenticado en `equipment`/`history`/`maintenance_plan`/`profiles` (necesario para resolver nombres de otros usuarios en Historial/Solicitudes — restringir `profiles` a "uno mismo" dejaba a cualquiera que no fuera admin/technician viendo "Desconocido"). `faults` sí está restringido a dueño/asignado/admin-technician. Postgres exige `GRANT` de tabla además de la policy — sin el grant a `service_role` sobre `profiles`, las Edge Functions fallan con "Forbidden" aunque el caller sea admin real. Todo esto ya está en la migración.

**Realtime:** `equipment` y `faults` están en la publication `supabase_realtime`. Las pantallas abren un canal (`supabase.channel(...).on("postgres_changes", ...)`) y listo — no hay botones de refresh manual en esas pantallas.

**Storage (fotos de falla):** bucket `fault-photos` (lectura pública, escritura autenticada). El flujo comprime a webp y sube en base64 en vez de `blob:` + `fetch` — Safari en iOS devuelve blobs de 0 bytes silenciosamente con ese patrón, así que se evita por completo.

**Edge Functions:** `invite-user` (admin crea cuenta con email+password directo) y `delete-user` (bloqueado para otros admins). Ambas necesitan el secret `SB_SECRET_KEY` y "Verify JWT with legacy secret" desactivado — ver `SETUP.md`.

## Roles

| Rol          | Qué ve/hace                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `user`       | Equipos, reportar falla, Mis solicitudes.                                                               |
| `technician` | Equipos, reportar falla, Cola de trabajo (asignarse/avanzar estado).                                    |
| `admin`      | Todo lo anterior + Usuarios (invitar/editar/desactivar/eliminar), Solicitudes (todas), CRUD de equipos. |

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
- **Equipos no se actualiza solo entre pestañas/usuarios** → confirmá que `equipment`/`faults` estén en la publication `supabase_realtime` (están en la migración; sin eso las suscripciones se conectan pero nunca reciben eventos, sin error visible).
- **`supabase db push` falla con error de red/IPv6** → aplicar el SQL manual vía el SQL Editor del dashboard.
