-- ============================================================
-- Migración 225: reapuntar RLS que usaban códigos de permiso v1 muertos.
--
-- 'config.manage_stores' y 'pos.apply_discount' pertenecían al esquema de
-- permisos v1 (mig 001), que la mig 010 (roles_v2) borró por completo
-- (DELETE FROM permissions) al reseembrar el esquema v2 (config.edit, pos.sell…).
-- Estas 3 policies quedaron apuntando a códigos inexistentes -> user_has_permission
-- devolvía false -> bloqueaban a todo el mundo salvo service-role.
--
-- Las tablas se escriben SOLO por server actions (service-role, que bypassa RLS);
-- no hay escritura client-side. Reapuntar a config.edit es defensa en profundidad:
-- alinea la RLS con el permiso real v2 (mismo que ya usan las acciones).
-- ============================================================

DROP POLICY IF EXISTS "discount_codes_modify" ON discount_codes;
CREATE POLICY "discount_codes_modify" ON discount_codes
  FOR ALL TO public
  USING (user_has_permission(auth.uid(), 'config.edit'));

DROP POLICY IF EXISTS "stores_modify" ON stores;
CREATE POLICY "stores_modify" ON stores
  FOR ALL TO public
  USING (user_has_permission(auth.uid(), 'config.edit'));

DROP POLICY IF EXISTS "warehouses_modify" ON warehouses;
CREATE POLICY "warehouses_modify" ON warehouses
  FOR ALL TO public
  USING (user_has_permission(auth.uid(), 'config.edit'));
