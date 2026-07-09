-- ============================================================
-- Migración 254 — Tipo de prenda "Teba" en el catálogo garment_types
--
-- Petición de Ismael: el desplegable "Prenda" del diálogo Editar pedido
-- (edit-order-dialog, que lista garment_types activas) no ofrecía Teba.
-- La teba existía solo como slug del wizard del sastre ('teba' en
-- nueva-venta-ficha-client); al crear el pedido, findGarmentTypeByCode('teba')
-- no encontraba el código y caía al fallback (americana): las 6 líneas de teba
-- existentes en prod están guardadas con garment_type 'americana'.
--
-- 1) Alta idempotente del tipo (categoria sastreria; has_sketch false — solo
--    lo usa el CRUD de configuración). Con el código presente, el wizard
--    asignará 'teba' automáticamente a las nuevas tebas.
-- 2) Remapeo de las líneas teba existentes (prendaSlug/prenda = 'teba' que
--    quedaron como americana) al nuevo tipo, para que el desplegable de
--    Editar pedido las muestre como Teba. No cambia su edición de ficha:
--    edit-ficha-dialog decide por prendaSlug y trata la teba como americana.
-- ============================================================

INSERT INTO garment_types (code, name, category, sort_order, is_active, has_sketch)
SELECT 'teba', 'Teba', 'sastreria', 1, true, false
WHERE NOT EXISTS (SELECT 1 FROM garment_types WHERE code = 'teba');

UPDATE tailoring_order_lines l
   SET garment_type_id = (SELECT id FROM garment_types WHERE code = 'teba')
 WHERE (l.configuration->>'prendaSlug' = 'teba' OR l.configuration->>'prenda' = 'teba')
   AND l.garment_type_id = (SELECT id FROM garment_types WHERE code = 'americana');
