-- Migration 067: Consolidar roles sastre y vendedor
-- Elimina los roles 'sastre' y 'vendedor_basico', migrando todo a 'sastre_plus' y 'vendedor_avanzado'.
-- Idempotente: segura de ejecutar múltiples veces.

-- ─── 1. Copiar permisos de 'sastre' → 'sastre_plus' (los que no tenga ya) ────
INSERT INTO role_permissions (role_id, permission_id)
SELECT
  (SELECT id FROM roles WHERE name = 'sastre_plus'),
  rp.permission_id
FROM role_permissions rp
WHERE rp.role_id = (SELECT id FROM roles WHERE name = 'sastre')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp2
    WHERE rp2.role_id = (SELECT id FROM roles WHERE name = 'sastre_plus')
      AND rp2.permission_id = rp.permission_id
  );

-- ─── 2. Copiar permisos de 'vendedor_basico' → 'vendedor_avanzado' (los que no tenga ya) ───
INSERT INTO role_permissions (role_id, permission_id)
SELECT
  (SELECT id FROM roles WHERE name = 'vendedor_avanzado'),
  rp.permission_id
FROM role_permissions rp
WHERE rp.role_id = (SELECT id FROM roles WHERE name = 'vendedor_basico')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp2
    WHERE rp2.role_id = (SELECT id FROM roles WHERE name = 'vendedor_avanzado')
      AND rp2.permission_id = rp.permission_id
  );

-- ─── 3. Migrar usuarios con rol 'sastre' → 'sastre_plus' (si no lo tienen ya) ───
INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, (SELECT id FROM roles WHERE name = 'sastre_plus')
FROM user_roles ur
WHERE ur.role_id = (SELECT id FROM roles WHERE name = 'sastre')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur2
    WHERE ur2.user_id = ur.user_id
      AND ur2.role_id = (SELECT id FROM roles WHERE name = 'sastre_plus')
  );

-- ─── 4. Migrar usuarios con rol 'vendedor_basico' → 'vendedor_avanzado' (si no lo tienen ya) ───
INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, (SELECT id FROM roles WHERE name = 'vendedor_avanzado')
FROM user_roles ur
WHERE ur.role_id = (SELECT id FROM roles WHERE name = 'vendedor_basico')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur2
    WHERE ur2.user_id = ur.user_id
      AND ur2.role_id = (SELECT id FROM roles WHERE name = 'vendedor_avanzado')
  );

-- ─── 5. Eliminar asignaciones de roles obsoletos de user_roles ───────────────
DELETE FROM user_roles
WHERE role_id IN (
  SELECT id FROM roles WHERE name IN ('sastre', 'vendedor_basico')
);

-- ─── 6. Desactivar roles obsoletos (NO borrar, por integridad referencial) ───
UPDATE roles
SET is_active = false
WHERE name IN ('sastre', 'vendedor_basico');

-- ─── Verificación ─────────────────────────────────────────────────────────────
-- SELECT r.name, COUNT(ur.user_id) as usuarios
-- FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
-- WHERE r.name IN ('sastre', 'sastre_plus', 'vendedor_basico', 'vendedor_avanzado')
-- GROUP BY r.name ORDER BY r.name;
