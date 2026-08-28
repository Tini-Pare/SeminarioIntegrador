-- Severity is not part of the application's fault catalog. Remove the
-- legacy nullable column from projects that already ran the base migration.
alter table fallo drop column if exists fa_gravedad;
