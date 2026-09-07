-- 275_fix_rls_permisos_inexistentes.sql
--
-- Cinco tablas eran ILEGIBLES desde el navegador para TODOS los usuarios,
-- incluido el administrador, porque sus políticas RLS exigen permisos que ya no
-- existen en la tabla `permissions`.
--
-- El catálogo de permisos se rehízo en su día (hoy son 76 códigos) pero las
-- políticas se quedaron con los nombres antiguos. `user_has_permission` no
-- tiene bypass de administrador: si el código no existe, devuelve false para
-- todo el mundo y la política deniega siempre.
--
-- No se notó antes porque casi toda la aplicación consulta con service-role
-- desde server actions, que salta RLS. Solo se ve en las pantallas que
-- consultan directamente desde el navegador. Comprobado simulando la sesión de
-- un administrador, un sastre_plus y un vendedor_avanzado reales:
--
--   client_notes      0 de 13      -> pestaña Notas del cliente, vacía (admin y sastre)
--   audit_logs        0 de 13.924  -> Configuración > Auditoría, vacía
--   fabrics           0 de 283     -> selector de telas del asistente de pedido, vacío
--   online_orders     0 de 16      -> pedidos online del listado de Pedidos
--   cash_withdrawals  0 de 53      -> retiradas de efectivo en Contabilidad y en el resumen de caja
--
-- Se sustituye cada permiso fantasma por el equivalente REAL del catálogo, sin
-- ampliar el acceso de nadie: los códigos elegidos ya los tienen exactamente
-- los roles que deben poder hacer cada cosa.
--
--   config.view_audit_log     -> audit.view                (solo administrador)
--   pos.view_cash_history     -> pos.access                (roles de caja)
--   pos.cash_withdrawal       -> cash_withdrawals.manage   (solo administrador)
--   clients.view_notes        -> clients.view              (staff)
--   clients.add_notes         -> clients.edit              (staff)
--   stock.read                -> products.view             (staff)
--   stock.create_product      -> products.edit             (administrador y sastre_plus)
--   cms.manage_online_orders  -> shop.view / shop.edit      (solo administrador)
--
-- No toca ni un dato: solo cambia quién puede leerlos.

-- ── audit_logs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS audit_select ON audit_logs;
CREATE POLICY audit_select ON audit_logs
  FOR SELECT USING (user_has_permission(auth.uid(), 'audit.view'));

-- ── cash_withdrawals ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cash_withdrawals_select ON cash_withdrawals;
CREATE POLICY cash_withdrawals_select ON cash_withdrawals
  FOR SELECT USING (user_has_permission(auth.uid(), 'pos.access'));

DROP POLICY IF EXISTS cash_withdrawals_insert ON cash_withdrawals;
CREATE POLICY cash_withdrawals_insert ON cash_withdrawals
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'cash_withdrawals.manage'));

-- ── client_notes ────────────────────────────────────────────────────────────
-- Las notas marcadas como privadas quedan reservadas al administrador: hasta
-- ahora la marca `is_private` no la miraba nadie (hoy no hay ninguna privada,
-- así que el cambio no oculta nada que se estuviera viendo).
DROP POLICY IF EXISTS client_notes_select ON client_notes;
CREATE POLICY client_notes_select ON client_notes
  FOR SELECT USING (
    user_has_permission(auth.uid(), 'clients.view')
    AND (
      NOT COALESCE(is_private, FALSE)
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND r.is_active
          AND r.name IN ('administrador', 'super_admin')
          AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
      )
    )
  );

DROP POLICY IF EXISTS client_notes_insert ON client_notes;
CREATE POLICY client_notes_insert ON client_notes
  FOR INSERT WITH CHECK (user_has_permission(auth.uid(), 'clients.edit'));

DROP POLICY IF EXISTS client_notes_modify ON client_notes;
CREATE POLICY client_notes_modify ON client_notes
  FOR UPDATE USING (user_has_permission(auth.uid(), 'clients.edit'));

-- ── fabrics ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fabrics_select ON fabrics;
CREATE POLICY fabrics_select ON fabrics
  FOR SELECT USING (user_has_permission(auth.uid(), 'products.view'));

DROP POLICY IF EXISTS fabrics_modify ON fabrics;
CREATE POLICY fabrics_modify ON fabrics
  FOR ALL USING (user_has_permission(auth.uid(), 'products.edit'));

-- ── online_orders ───────────────────────────────────────────────────────────
-- Se conserva tal cual la parte que deja a cada cliente ver SUS pedidos.
DROP POLICY IF EXISTS online_orders_select ON online_orders;
CREATE POLICY online_orders_select ON online_orders
  FOR SELECT USING (
    user_has_permission(auth.uid(), 'shop.view')
    OR client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS online_orders_modify ON online_orders;
CREATE POLICY online_orders_modify ON online_orders
  FOR ALL USING (user_has_permission(auth.uid(), 'shop.edit'));
