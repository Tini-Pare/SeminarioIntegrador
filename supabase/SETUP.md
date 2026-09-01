# Rebuilding the Supabase project from scratch

If the Supabase project gets deleted (or you're standing up a new
environment — staging, a client's own account, etc.), follow these steps in
order. Everything the app needs lives in this repo; nothing is stored only
in the Supabase dashboard.

## 1. Create the project

Supabase dashboard → New project. Name it, pick a region, set a database
password (save it somewhere safe — it's the Postgres superuser password,
not used day-to-day but needed for direct DB access).

## 2. Run the schema migrations

SQL Editor → run, in order:

1. `migrations/0001_init.sql` — base tables, the `fault-photos` storage
   bucket, and `current_role_name()` (still used by 0003's RLS policies).
2. `migrations/0003_reemplazo_gestion_mantenimiento.sql` — replaces
   0001's `equipment`/`faults`/`history`/`maintenance_plan` with the
   maintenance-management model (equipo, lugares, tipos_de_equipos,
   solicitudes, orden_de_trabajo, historial, plus the rest of the schema
   with no UI yet). Creates the `sync_equipo_estado` function, its RLS
   policies, and Realtime on `equipo`/`solicitudes`/`orden_de_trabajo`.

Do **not** run `migrations/0002_gestion_mantenimiento.sql` — it's the raw
reference model 0003 was adapted from (no RLS, no Supabase Auth wiring,
no `eq_codigo`/`sol_urgencia`/etc.), not meant to run on its own. Running
it before 0003 would fail anyway (0003 creates several of the same table
names). This also means `supabase db push` with a linked CLI can't be
used as-is — it would try to run 0002 too — so stick to the manual SQL
Editor steps above (0001, then 0003) until 0002 is removed from the
migrations folder or CLI-linking is possible from your environment.

## 3. Get the API keys

Project Settings → API Keys → "Publishable and secret API keys" tab:

- Copy the **publishable key** (`sb_publishable_...`).
- Copy the **secret key** (`sb_secret_...`) — needed in step 5, treat it
  like a password, never commit it or share it outside this setup.

## 4. Set the app's environment variables

In `.env` at the repo root (create it if it doesn't exist):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the publishable key from step 3>
```

## 5. Deploy the two Edge Functions

Both live in `supabase/functions/`. For each one (`invite-user`,
`delete-user`):

1. Dashboard → Edge Functions → **New Function** → name it exactly
   `invite-user` (or `delete-user`) — the name must match exactly, the app
   calls these URLs directly.
2. Paste the full contents of that function's `index.ts`.
3. Deploy.
4. Go to the function's **Settings** tab → turn **"Verify JWT with legacy
   secret"** OFF. (The function does its own admin check internally; this
   platform-level gate is redundant and, on newer projects, actively
   blocks the calls.)

## 6. Add the custom secret both functions need

Edge Functions → **Secrets** page → "Add or Replace Secrets":

- Name: `SB_SECRET_KEY`
- Value: the secret key copied in step 3

Why this exists: `SUPABASE_SERVICE_ROLE_KEY` is the old/legacy env var
Supabase auto-injects into every Edge Function, but on projects created
under the newer key system it doesn't reliably carry admin (bypass-RLS)
privileges — the functions read `SB_SECRET_KEY` first and only fall back
to the legacy var if it's missing, so this manual step is required on
every fresh project.

## 7. Create the first admin account

You need at least one admin to invite everyone else through the app (the
`/users` screen). Since 0004_login_por_legajo.sql, the app logs in by
`legajo` (employee ID number), not email — `auth.users` still needs an
email internally, so the first admin gets a synthetic one following the
same `<legajo>@legajo.mantia.internal` scheme the invite-user Edge Function
uses for everyone invited afterwards. `auth.users` rows can't be created
directly via SQL, so use the dashboard:

1. Pick a legajo for yourself, e.g. `1`.
2. Authentication → Users → **Add user** → email `1@legajo.mantia.internal`,
   any password → check "Auto Confirm User" → Create.
3. Copy the new user's UID from the users list.
4. SQL Editor, run (replace the UID and name; keep the email matching what
   you used in step 2):

```sql
insert into profiles (id, name, email, legajo, role, active)
values ('<uid-from-step-3>', 'Your Name', '1@legajo.mantia.internal', '1', 'admin', true);
```

5. Log into the app with legajo `1` and that password — you're now the
   first admin and can invite everyone else (technicians, users) from the
   Usuarios screen, which creates both the login and the profile row in
   one step from just a legajo, name, password and role.

## 8. Verify

- Log in as the admin, confirm the Usuarios/Equipos/Solicitudes nav shows.
- Add one equipment row via "+ Agregar equipo".
- Invite a technician account via "+ Invitar persona", confirm they can
  log in and see Equipos/Cola de trabajo (not Usuarios).
- Report a fault with a photo attached ("+ Reportar falla" → "Elegir de
  galería") and confirm the thumbnail shows up in Solicitudes — this
  validates the `fault-photos` bucket and its policies are set up right.

That's the full rebuild. No other manual Supabase configuration is
required — RLS, grants, and both Edge Functions are the only
project-specific state, and all three are captured above (see 0003's
comments for what's schema-complete-but-no-UI-yet: proveedores, compras,
repuestos, planes de mantenimiento preventivo, catálogo de fallas).
