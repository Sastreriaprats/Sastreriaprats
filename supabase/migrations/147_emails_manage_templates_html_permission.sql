-- ==========================================
-- 147: Permiso técnico para el editor HTML de plantillas de email
-- ==========================================
-- Bloquea el acceso al editor del HTML maestro de las plantillas. Solo el
-- administrador (desarrollador) debe tenerlo. emails.manage_templates queda
-- libre para una futura edición de contenido sin código (Fase 17).
--
-- NOTA: category usa 'Emails' (capitalizada, coherente con los permisos
-- existentes del módulo en la mig 001). No existe categoría 'comunicaciones'
-- en el catálogo actual.

INSERT INTO permissions (code, module, action, display_name, description, category, sort_order, is_sensitive)
VALUES (
  'emails.manage_templates_html',
  'emails',
  'manage_templates_html',
  'Editar HTML maestro de plantillas de email',
  'Permite acceder al editor técnico del HTML de las plantillas. NO confundir con emails.manage_templates (que permite gestionar el contenido visual sin código).',
  'Emails',
  156,
  true
)
ON CONFLICT (code) DO NOTHING;

-- Asignar a administrador
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'administrador'
  AND p.code = 'emails.manage_templates_html'
ON CONFLICT DO NOTHING;
