-- Drops a stray UNIQUE constraint on fallo.fa_gravedad.
--
-- It's not in any migration (0002/0003 declare fa_gravedad as a plain
-- varchar(50)) — it was added by hand to the database at some point. Since
-- fa_gravedad only ever holds 'low' / 'medium' / 'high', a UNIQUE on it caps
-- the whole catalog at three fault types and makes the 4th INSERT fail with
-- 23505 on "fallo_fa_gravedad_key".

alter table fallo drop constraint if exists fallo_fa_gravedad_key;
