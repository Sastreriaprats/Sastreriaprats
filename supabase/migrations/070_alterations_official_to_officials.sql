-- Migración 070: alterations.official_id pasa de alteration_officials a officials, y se elimina alteration_officials

-- Drop dinámico del FK actual (sin asumir el nombre exacto del constraint)
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = con.conrelid
    AND att.attnum = ANY(con.conkey)
  WHERE cl.relname = 'alterations'
    AND con.contype = 'f'
    AND att.attname = 'official_id'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE alterations DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

-- Re-crear FK apuntando a officials
ALTER TABLE alterations
  ADD CONSTRAINT alterations_official_id_fkey
  FOREIGN KEY (official_id) REFERENCES officials(id) ON DELETE SET NULL;

-- Eliminar la tabla duplicada (está vacía, verificado)
DROP TABLE IF EXISTS alteration_officials CASCADE;
