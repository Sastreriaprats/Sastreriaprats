-- ============================================================
-- Migración 256 — Unificar los tipos de prenda "Camisa" y "Camisería"
--
-- Petición de Ismael: el desplegable de Editar pedido ofrecía "Camisa" y
-- "Camisería" (duplicidad histórica: 'camisa' viene del seed original 002,
-- 'camiseria' se añadió en la mig 050; ambos activos y en uso — 25 líneas
-- 'camisa' vs 298 'camiseria'). El sistema ya los trataba como equivalentes
-- (line-groups agrupa ambos como camisería). Se unifica en "Camisería".
--
-- Verificado antes de tocar:
--  - createFichaOrder resuelve camisería por nombre 'camiser…'/código
--    'camiseria' sobre tipos ACTIVOS → no usa 'camisa'.
--  - La página de medidas del sastre resuelve por nombre 'Camisería' y sus
--    pestañas no incluyen 'Camisa'.
--  - client_measurements y garment_config_options: 0 filas con 'camisa'.
--  - measurement_fields tiene 11 campos legacy bajo 'camisa' sin consumidor:
--    se quedan colgando del tipo inactivo (histórico, sin efecto).
--  - Las referencias a 'camisa' en código son sobre configuration.prenda
--    (texto de ficha), no sobre el tipo del catálogo → intactas.
--
-- 1) Remapear las líneas del tipo 'camisa' al tipo 'camiseria'.
-- 2) Desactivar 'camisa' (NO borrar: conserva FKs e histórico; desaparece de
--    los desplegables, que filtran is_active).
-- "Camisería Industrial" no se toca (concepto distinto, flujo industrial).
-- ============================================================

UPDATE tailoring_order_lines
   SET garment_type_id = (SELECT id FROM garment_types WHERE code = 'camiseria'),
       updated_at = now()
 WHERE garment_type_id = (SELECT id FROM garment_types WHERE code = 'camisa');

UPDATE garment_types
   SET is_active = false
 WHERE code = 'camisa';
