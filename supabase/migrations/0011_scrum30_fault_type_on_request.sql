-- Allows a request to keep the optional fault category selected by its reporter.
-- The category remains optional because existing requests and catalogs may not
-- have a matching value.
alter table solicitudes
  add column if not exists fa_id_fallo int references fallo(fa_id_fallo);

-- The catalog is administered by admins, but every authenticated application
-- role can read it to classify a new request.
drop policy if exists "fallo: any authenticated read" on fallo;
create policy "fallo: any authenticated read" on fallo
  for select using (auth.uid() is not null);
