-- ============================================================
-- Migración 224: endurecer RLS de client_companies (defensa en profundidad)
--
-- Antes: las 4 policies eran USING/CHECK `true` (cualquier autenticado podía
-- leer/crear/editar/borrar empresas de facturación — datos fiscales). La
-- escritura se hacía client-side directa desde el tab.
--
-- Ahora: la escritura pasa por server actions (clients.edit) con service-role
-- (que bypassa RLS). Esta RLS es la 2ª capa: bloquea cualquier acceso
-- client-side directo. Patrón replicado de officials (user_has_permission):
--   - SELECT  -> clients.view
--   - INSERT/UPDATE/DELETE -> clients.edit
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can view client companies"   ON client_companies;
DROP POLICY IF EXISTS "Authenticated users can insert client companies" ON client_companies;
DROP POLICY IF EXISTS "Authenticated users can update client companies" ON client_companies;
DROP POLICY IF EXISTS "Authenticated users can delete client companies" ON client_companies;

CREATE POLICY client_companies_select ON client_companies
  FOR SELECT TO authenticated
  USING (user_has_permission(auth.uid(), 'clients.view'));

CREATE POLICY client_companies_insert ON client_companies
  FOR INSERT TO authenticated
  WITH CHECK (user_has_permission(auth.uid(), 'clients.edit'));

CREATE POLICY client_companies_update ON client_companies
  FOR UPDATE TO authenticated
  USING (user_has_permission(auth.uid(), 'clients.edit'))
  WITH CHECK (user_has_permission(auth.uid(), 'clients.edit'));

CREATE POLICY client_companies_delete ON client_companies
  FOR DELETE TO authenticated
  USING (user_has_permission(auth.uid(), 'clients.edit'));
