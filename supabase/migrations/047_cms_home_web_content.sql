-- Ampliar section_type para secciones de la home
ALTER TABLE cms_sections DROP CONSTRAINT IF EXISTS cms_sections_section_type_check;
ALTER TABLE cms_sections ADD CONSTRAINT cms_sections_section_type_check CHECK (
  section_type IN (
    'hero', 'content', 'gallery', 'testimonials', 'cta', 'features', 'faq', 'custom',
    'editorial_strip', 'categories', 'featured', 'editorial_double', 'stores'
  )
);

-- Página home (idempotente)
INSERT INTO cms_pages (slug, title_es, page_type, status)
VALUES ('home', 'Inicio', 'landing', 'published')
ON CONFLICT (slug) DO UPDATE SET title_es = EXCLUDED.title_es, status = EXCLUDED.status, updated_at = NOW();

-- Secciones de la home (solo si no existen ya)
DO $$
DECLARE
  home_id UUID;
  sec_cat UUID;
  sec_stores UUID;
BEGIN
  SELECT id INTO home_id FROM cms_pages WHERE slug = 'home' LIMIT 1;
  IF home_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'hero' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, title_es, subtitle_es, sort_order, settings)
    VALUES (
      home_id, 'hero',
      'SASTRERÍA PRATS',
      'Madrid · Est. 1985',
      10,
      '{"image_url":"https://www.sastreriaprats.com/cdn/shop/files/AW25_-_DIEGO_MARTIN-191.jpg?v=1762421411&width=2000","button1_label":"DESCUBRIR COLECCIÓN","button1_url":"/boutique","button2_label":"RESERVAR CITA","button2_url":"/reservar"}'::jsonb
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'editorial_strip' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, content_es, sort_order)
    VALUES (home_id, 'editorial_strip', 'NUEVA COLECCIÓN · OTOÑO INVIERNO 2025 · HECHO A MEDIDA EN MADRID', 20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'categories' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, title_es, sort_order)
    VALUES (home_id, 'categories', 'Categorías', 30)
    RETURNING id INTO sec_cat;
    INSERT INTO cms_blocks (section_id, block_type, title_es, image_url, link_url, sort_order)
    VALUES
      (sec_cat, 'card', 'Sastrería a Medida', 'https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-3.jpg?v=1718892989&width=1200', '/sastreria', 10),
      (sec_cat, 'card', 'Boutique', 'https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-6.jpg?v=1718892990&width=1200', '/boutique', 20),
      (sec_cat, 'card', 'Cita Previa', 'https://www.sastreriaprats.com/cdn/shop/files/AW25_-_DIEGO_MARTIN-191.jpg?v=1762421411&width=800', '/reservar', 30);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'featured' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, title_es, sort_order)
    VALUES (home_id, 'featured', 'SELECCIÓN', 40);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'editorial_double' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, title_es, content_es, sort_order, settings)
    VALUES (
      home_id, 'editorial_double',
      'Arte hecho prenda',
      'Cada pieza nace en nuestro taller de Madrid. Descubre la sastrería a medida y la colección de boutique.',
      50,
      '{"image_url":"https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-3.jpg?v=1718892989&width=1200","button_label":"DESCUBRIR","button_url":"/sastreria"}'::jsonb
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'stores' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, title_es, sort_order)
    VALUES (home_id, 'stores', 'NUESTRAS TIENDAS', 60)
    RETURNING id INTO sec_stores;
    INSERT INTO cms_blocks (section_id, block_type, title_es, content_es, image_url, link_url, sort_order)
    VALUES
      (sec_stores, 'card', 'El Viso', 'C/ Menina 22, 28023 Madrid', 'https://www.sastreriaprats.com/cdn/shop/files/MENINA_-_PRATS_389bd184-3fe5-4fa5-a9f0-0d28a69d5626.jpg?v=1718899181&width=1200', 'https://maps.app.goo.gl/Vf8puqTToyqvTirq5', 10),
      (sec_stores, 'card', 'Wellington', 'C/ Wellington 26, 28008 Madrid', 'https://www.sastreriaprats.com/cdn/shop/files/DIEGO_PRATS-76.jpg?v=1718899328&width=1200', 'https://maps.app.goo.gl/Cd36bN32ctpTmtub8', 20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'cta' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, title_es, sort_order, settings)
    VALUES (home_id, 'cta', 'El traje perfecto comienza aquí.', 70, '{"button_label":"RESERVAR CITA","button_url":"/reservar"}'::jsonb);
  END IF;
END $$;

-- Bucket web-content: crear desde Dashboard (Storage > New bucket > web-content, public).
-- Políticas para que admins puedan subir y todo el mundo leer:
-- INSERT: authenticated con rol admin o con permiso cms.edit_pages (no aplicable en storage).
-- En la app usaremos el cliente admin para subir; el bucket debe ser público para lectura.
