-- Reactivar rol Vendedor Básico
UPDATE roles SET is_active = true, updated_at = NOW() WHERE name = 'vendedor_basico';
