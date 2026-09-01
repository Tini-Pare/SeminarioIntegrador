-- Resyncs every identity sequence to MAX(id) of its table.
--
-- Rows seeded by hand with explicit ids (imports, manual INSERTs in the SQL
-- Editor) don't advance the backing sequence, so the next app INSERT reuses an
-- id that's already taken and fails with SQLSTATE 23505 on the *_pkey
-- constraint. That surfaced as a misleading "nombre repetido" on the fault /
-- general-task forms.
--
-- Safe to run more than once: setval to the current max is a no-op when the
-- sequence is already ahead. Empty tables are skipped.

do $$
declare
  r record;
  seq text;
  max_id bigint;
begin
  for r in
    select c.relname as table_name, a.attname as column_name
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attidentity in ('a', 'd')   -- GENERATED ALWAYS / BY DEFAULT AS IDENTITY
  loop
    seq := pg_get_serial_sequence(format('public.%I', r.table_name), r.column_name);
    if seq is null then
      continue;
    end if;

    execute format('select max(%I) from public.%I', r.column_name, r.table_name)
      into max_id;

    if max_id is not null then
      perform setval(seq, max_id);
    end if;
  end loop;
end $$;
