-- Política RLS para permitir DELETE en officials
-- (puede no existir si la migración 013 sobreescribió las de 012 sin incluir DELETE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'officials' AND policyname = 'officials_delete'
  ) THEN
    EXECUTE 'CREATE POLICY officials_delete ON officials FOR DELETE USING (user_has_permission(auth.uid(), ''officials.edit''::text))';
  END IF;
END $$;
