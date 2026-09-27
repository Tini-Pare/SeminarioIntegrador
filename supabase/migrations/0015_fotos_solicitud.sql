-- Lets a solicitud carry several photos instead of just one.
--
-- Feedback from class observations on other groups' CMMS (2026-09-27):
--   4. "El otro grupo tiene para cargar varias imágenes... que sea ver tipo
--      twitter scrollear para el costado" — solicitudes.sol_foto_url only
--      ever held one photo.
--
-- Point 3 from the same feedback ("falta elegir el fallo genérico al
-- reportar") turned out not to apply as originally read: the diagnosis
-- (fallo genérico) isn't known by the employee reporting symptoms — it's
-- only known once someone evaluates the equipment, i.e. when the
-- orden_de_trabajo is created. That's exactly what fallo_por_orden (0003)
-- already models — fallo <-> orden_de_trabajo, not fallo <-> solicitud —
-- so no schema change was needed there; see assignToMe in
-- src/lib/queries/faults.ts, which now takes the fallo genérico as a
-- parameter instead.

-- ---------------------------------------------------------------------
-- solicitud_foto: one row per photo attached to a solicitud, ordered
-- for the horizontal gallery. sol_foto_url on solicitudes is kept only as
-- a legacy column (existing rows already have their photo copied below);
-- new code reads/writes solicitud_foto instead.
-- ---------------------------------------------------------------------
create table solicitud_foto (
    sf_id            int generated always as identity primary key,
    sol_id_solicitud int not null references solicitudes(sol_id_solicitud) on delete cascade,
    sf_foto_url      text not null,
    sf_orden         int not null default 0,
    sf_creado_en     timestamptz not null default now()
);

insert into solicitud_foto (sol_id_solicitud, sf_foto_url, sf_orden)
select sol_id_solicitud, sol_foto_url, 0
from solicitudes
where sol_foto_url is not null;

comment on column solicitudes.sol_foto_url is
  'Legacy single-photo column, superseded by solicitud_foto (2026-09-27). Kept so old rows do not lose their photo; no longer written to.';

grant select, insert on solicitud_foto to authenticated;

-- RLS mirrors "solicitudes: read own or admin/technician" / "authenticated
-- insert own": a photo is only ever visible/insertable through its parent
-- solicitud's own access rule.
alter table solicitud_foto enable row level security;

create policy "solicitud_foto: read via parent solicitud" on solicitud_foto
  for select using (
    exists (
      select 1 from solicitudes s
      where s.sol_id_solicitud = solicitud_foto.sol_id_solicitud
        and (s.p_legajo_solicitante = auth.uid() or current_role_name() in ('admin', 'technician'))
    )
  );

create policy "solicitud_foto: insert on own solicitud" on solicitud_foto
  for insert with check (
    exists (
      select 1 from solicitudes s
      where s.sol_id_solicitud = solicitud_foto.sol_id_solicitud
        and s.p_legajo_solicitante = auth.uid()
    )
  );
