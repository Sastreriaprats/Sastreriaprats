-- RLS para la tabla officials (tabla ya creada en Supabase)
ALTER TABLE officials ENABLE ROW LEVEL SECURITY;

CREATE POLICY officials_select ON officials
FOR SELECT USING (user_has_permission(auth.uid(), 'officials.view'::text));

CREATE POLICY officials_insert ON officials
FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'officials.create'::text));

CREATE POLICY officials_update ON officials
FOR UPDATE USING (user_has_permission(auth.uid(), 'officials.edit'::text));
