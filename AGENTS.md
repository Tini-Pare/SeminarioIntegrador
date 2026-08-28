# Project Instructions

## Current Scope

- The current work is Sprint 2: close the remaining Sprint 1 work and the
  administrative catalog stories before starting future sprints.
- Use `TASK.md` as the active checklist. The current explicitly requested
  stories are SCRUM-57, SCRUM-14, SCRUM-15, and SCRUM-16; SCRUM-17 remains out
  of scope unless the user explicitly changes that decision.
- Do not invent modules or advance to stock, preventive maintenance, costs,
  purchasing, reports, or other future-sprint functionality.
- When a story says inhabilitar, preserve the row and use its logical active
  flag. Equipment status is automatic; do not manually write `eq_estado`.

## Stack And Entry Points

- This is a single Expo Router app, not a monorepo. Run commands from this
  repository root; there is no `mantia/` subdirectory.
- The project targets Expo SDK 54. Consult the versioned docs at
  https://docs.expo.dev/versions/v54.0.0/ before changing Expo APIs or plugins.
- Authenticated routes are under `src/app/(app)/`; login is under
  `src/app/(auth)/`. `src/app/_layout.tsx` owns the session redirect and
  `src/app/(app)/_layout.tsx` owns role-filtered navigation.
- Screens must use functions in `src/lib/queries/` for Supabase access; do not
  call `supabase.from(...)` directly from a screen or component.
- Every screen's business data must be read from and written to the database:
  create, edit, inactivate, delete, and list flows must use query functions.
  React state is only for form values, loading/error UI, filters, and temporary
  interaction state; after a mutation, reload the authoritative row/list from
  Supabase instead of treating local state as persisted data.
- `src/types/database.ts` is a hand-maintained mirror of the SQL actually used
  by the query layer. Update it whenever a queried schema column changes.
- Edge Functions under `supabase/functions/` run on Deno and are excluded from
  the root TypeScript check; deploy them separately as described in
  `supabase/SETUP.md`.

## Commands

- Install: `npm install`
- Web development: `npx expo start --web` or `npm run web`
- Typecheck: `npx tsc --noEmit`
- Full tests: `npx jest --runInBand`
- One test file: `npx jest src/lib/__tests__/queries/equipment.test.ts --runInBand`
- One test name: `npx jest -t "test name" --runInBand`
- Web production export: `npx expo export --platform web`
- Format selected files: `npx prettier --write <files>`
- Format check: `npm run format:check` (the repository has no SQL Prettier
  parser, so format SQL separately or pass only supported files).
- `npm run lint` invokes `expo lint`, but this repository has no ESLint config;
  Expo may fail while trying to auto-install one. Do not treat that command as
  a reliable clean-lint gate until a project ESLint config is added.

## Data And Supabase

- For a fresh Supabase project, follow `supabase/SETUP.md` and run migrations
  manually in SQL Editor in its documented order: `0001`, `0003`, then
  `0004` through the latest migration.
- Never run `supabase/migrations/0002_gestion_mantenimiento.sql`; it is the raw
  reference model and conflicts with the replacement schema in `0003`.
- Keep the real relationships: equipment forms select a type and location by
  label but persist `te_id` and `lu_codigo`; request equipment selectors show
  friendly equipment data but persist `eq_id_equipo`.
- `tareas_generales.tag_activo`, `fallo.fa_activo`, and `equipo.eq_activo` are
  logical availability flags. Do not physically delete those records.
- Generic faults do not contain `fa_gravedad`; do not reintroduce that field.
- RLS and grants are part of the SQL setup. If a query or Edge Function gets a
  permission error, inspect the migration policies and grants before weakening
  application checks.
- The app reads `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the untracked `.env`. Edge Functions
  require the `SB_SECRET_KEY` secret; never commit secrets.

## UI Conventions

- Code, table/column names, functions, variables, and comments are in English.
  User-facing labels, placeholders, messages, and `README.md` are in Spanish.
- Put a blank line between sibling JSX elements or blocks inside a component
  return. Prettier preserves these blank lines but does not add them.
- Catalog and data lists (equipment, users, locations, requests, tasks, and
  faults) should stretch across the available horizontal space. Do not leave
  narrow fixed-width tables when a wider responsive container or horizontal
  scroll is needed.
- Preserve the existing mobile-first behavior: tables are for wider screens,
  cards or scrollable layouts are for narrow screens. UI tests are not present,
  so verify important layout and Supabase flows manually with the dev server.
- Fault photos must keep the existing compressed WebP/base64 upload flow; do
  not replace it with a `blob:` upload pattern that breaks on Safari/iOS.

`CLAUDE.md` delegates to this file. `README.md` documents the product and
architecture, while `supabase/SETUP.md` is the operational source of truth for
rebuilding the database and deploying Edge Functions.
