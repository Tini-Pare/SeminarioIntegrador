-- Drops profiles.area.
--
-- The column was declared in 0001_init.sql but never had a real purpose: the
-- app only ever wrote a free-text value from the edit-user form and showed it
-- back. It was removed from the app UI and dropped from the database by hand;
-- this migration keeps the migration history in sync so a fresh `db reset`
-- matches production.

alter table profiles drop column if exists area;
