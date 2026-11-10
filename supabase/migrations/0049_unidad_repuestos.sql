-- =====================================================================
-- Unit of measure for repuestos (rep_unidad)
--
-- Until now a repuesto's quantities (stock, mínimo, máximo, and every
-- movement, compra, pedido, remito and tarea line) were bare numbers.
-- This adds the unit they are counted in, from a closed list:
--
--   unidad    (u)   pieces: filtros, correas, rodamientos, capacitores
--   litro     (L)   liquids: aceite, desengrasante, líquido refrigerante
--   kilogramo (kg)  weighed: gas refrigerante (R-22, R-410A…), grasa
--   metro     (m)   cut to length: cable, caño de cobre, manguera
--
-- Quantities stay integers (int columns untouched): the unit is a label
-- the app shows next to every quantity, e.g. "Stock 12 L · Mín. 5 L".
-- New repuestos default to 'unidad'; the admin picks the unit when
-- creating or editing one.
--
-- Existing repuestos get a unit guessed from their name, only the first
-- time this runs (when the column is created), so re-running it never
-- overwrites a unit someone already corrected from the app. Names are
-- matched without accents or case. Names that name a piece (filtro,
-- sensor, válvula, conector…) always stay 'unidad'. Order matters: kg
-- first, then L (so "Líquido refrigerante" ends up in litros, not kg),
-- then m. Anything that matches nothing stays 'unidad'. Review the result with
-- the SELECT at the end and fix any wrong guess from Repuestos → Editar.
--
-- Idempotent: column added only if missing, constraint drop-then-add.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'repuestos' and column_name = 'rep_unidad'
  ) then
    alter table repuestos add column rep_unidad varchar(10) not null default 'unidad';

    -- Names naming a piece stay 'unidad' even when they mention a liquid,
    -- gas or length material: "Filtro de aceite", "Detector de gas
    -- refrigerante", "Compresor R410A", "Codo para caño 3/8", "Conector
    -- para manguera", "Cinta aislante" (a roll), "Spray lubricante" (a can).
    -- (s|es)? also catches plurals: "Filtros", "Uniones".
    create temporary table rep_piece on commit drop as
      select rep_id from repuestos
      where translate(lower(rep_nombre), 'áéíóúüñ', 'aeiouun')
        ~ '\m(filtro|sensor|detector|valvula|bomba|compresor|manometro|junta|reten|sello|tapa|kit|termostato|presostato|ventilador|motor|correa|conector|terminal|bornera|ficha|precinto|cinta|abrazadera|soporte|codo|union|tuerca|acople|cupla|niple|adaptador|spray|aerosol)(s|es)?\M';

    -- kilogramo: refrigerant gases (by name or R-code) and grease.
    update repuestos set rep_unidad = 'kilogramo'
      where rep_id not in (select rep_id from rep_piece)
        and translate(lower(rep_nombre), 'áéíóúüñ', 'aeiouun')
          ~ '\m(refrigerante|grasa|r-?(22|32|134a?|404a?|407c?|410a?|600a?))\M';

    -- litro: liquids. Only rows still at 'unidad', plus "líquido …", which
    -- moves "Líquido refrigerante" from kg to litros; "Grasa lubricante"
    -- stays in kg.
    update repuestos set rep_unidad = 'litro'
      where rep_id not in (select rep_id from rep_piece)
        and (rep_unidad = 'unidad'
             or translate(lower(rep_nombre), 'áéíóúüñ', 'aeiouun') ~ '\mliquidos?\M')
        and translate(lower(rep_nombre), 'áéíóúüñ', 'aeiouun')
          ~ '\m(aceite|liquido|desengrasante|limpiador|alcohol|solvente|thinner|anticongelante|glicol|lubricante|pintura)s?\M';

    -- metro: sold by length, plurals included ("Caños de cobre"), plus
    -- copper and capillary tube (but not "Tubo fluorescente").
    update repuestos set rep_unidad = 'metro'
      where rep_unidad = 'unidad'
        and rep_id not in (select rep_id from rep_piece)
        and translate(lower(rep_nombre), 'áéíóúüñ', 'aeiouun')
          ~ '\m((cable|cano|caneria|tuberia|manguera|aislante|burlete)s?|capilar(es)?|tubos? (de )?cobre)\M';
  end if;
end $$;

alter table repuestos drop constraint if exists repuestos_unidad_chk;
alter table repuestos add constraint repuestos_unidad_chk
  check (rep_unidad in ('unidad', 'litro', 'kilogramo', 'metro'));

-- Review the guessed units (run on its own after the migration):
-- select rep_unidad, rep_nombre from repuestos order by rep_unidad, rep_nombre;
