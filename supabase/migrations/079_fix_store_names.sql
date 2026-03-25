-- Corregir nombres y direcciones de tiendas en CMS y en la tabla stores

-- 1. CMS blocks: sección "stores" de la home
UPDATE cms_blocks
SET title_es = 'Hermanos Pinzón',
    content_es = 'Calle Hermanos Pinzón, 4 - 28036 Madrid',
    updated_at = NOW()
WHERE title_es IN ('El Viso', 'Espacio El Viso')
  AND section_id IN (
    SELECT id FROM cms_sections WHERE section_type = 'stores'
  );

UPDATE cms_blocks
SET content_es = 'Calle Velázquez, 8 - 28001 Madrid',
    updated_at = NOW()
WHERE title_es = 'Wellington'
  AND content_es NOT LIKE '%Velázquez%'
  AND section_id IN (
    SELECT id FROM cms_sections WHERE section_type = 'stores'
  );

-- 2. Tabla stores: corregir nombre de la tienda Pinzón
UPDATE stores
SET name = 'Hermanos Pinzón',
    updated_at = NOW()
WHERE code = 'PIN'
  AND name != 'Hermanos Pinzón';
