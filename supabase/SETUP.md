# Rebuilding the Supabase project from scratch

If the Supabase project gets deleted (or you're standing up a new
environment — staging, a client's own account, etc.), follow these steps in
order. Everything the app needs lives in this repo; nothing is stored only
in the Supabase dashboard.

## 1. Create the project

Supabase dashboard → New project. Name it, pick a region, set a database
password (save it somewhere safe — it's the Postgres superuser password,
not used day-to-day but needed for direct DB access).

## 2. Run the schema migration

SQL Editor → paste the full contents of `migrations/0001_init.sql` → Run.
One file, creates everything: tables, enums, grants, RLS policies, the
`sync_equipment_status` function, the `fault-photos` storage bucket, and
Realtime on `equipment`/`faults`. Nothing else needs to be run manually.
(With the Supabase CLI linked instead: `supabase db push`.)

## 3. Get the API keys

Project Settings → API Keys → "Publishable and secret API keys" tab:

- Copy the **publishable key** (`sb_publishable_...`).
- Copy the **secret key** (`sb_secret_...`) — needed in step 5, treat it
  like a password, never commit it or share it outside this setup.

## 4. Set the app's environment variables

In `mantia/.env` (create it from `.env.example` if it doesn't exist):

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
`/users` screen). `auth.users` rows can't be created directly via SQL, so
use the dashboard:

1. Authentication → Users → **Add user** → enter email + password → check
   "Auto Confirm User" → Create.
2. Copy the new user's UID from the users list.
3. SQL Editor, run (replace the UID, name, email):

```sql
insert into profiles (id, name, email, role, active)
values ('<uid-from-step-2>', 'Your Name', 'your@email.com', 'admin', true);
```

4. Log into the app with that email/password — you're now the first admin
   and can invite everyone else (technicians, users) from the Usuarios
   screen, which creates both the login and the profile row in one step.

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
project-specific state, and all three are captured above.
