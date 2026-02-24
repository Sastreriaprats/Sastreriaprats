-- RLS para estimates y estimate_lines (presupuestos)
-- Requiere: tablas estimates y estimate_lines creadas, función user_has_permission(uuid, text)

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY estimates_select ON estimates FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.view'));
CREATE POLICY estimates_insert ON estimates FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'accounting.edit'));
CREATE POLICY estimates_update ON estimates FOR UPDATE USING (user_has_permission(auth.uid(), 'accounting.edit'));

CREATE POLICY estimate_lines_select ON estimate_lines FOR SELECT USING (user_has_permission(auth.uid(), 'accounting.view'));
CREATE POLICY estimate_lines_insert ON estimate_lines FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'accounting.edit'));
CREATE POLICY estimate_lines_update ON estimate_lines FOR UPDATE USING (user_has_permission(auth.uid(), 'accounting.edit'));
