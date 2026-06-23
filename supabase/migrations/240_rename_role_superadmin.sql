-- Migración 240: renombrar el display del rol `informes_comisiones` a "SuperAdmin".
-- El nombre interno (name) se mantiene como 'informes_comisiones' porque está
-- referenciado en código y en migraciones previas (232, 233). Solo cambia la
-- etiqueta visible en Configuración → Usuarios.
-- Ya aplicado en producción vía service-role; este archivo lo deja registrado.

UPDATE roles
SET display_name = 'SuperAdmin'
WHERE name = 'informes_comisiones';
