-- Ampliar section_type para incluir process_steps
ALTER TABLE cms_sections DROP CONSTRAINT IF EXISTS cms_sections_section_type_check;
ALTER TABLE cms_sections ADD CONSTRAINT cms_sections_section_type_check CHECK (
  section_type IN (
    'hero', 'content', 'gallery', 'testimonials', 'cta', 'features', 'faq', 'custom',
    'editorial_strip', 'categories', 'featured', 'editorial_double', 'stores',
    'process_steps'
  )
);

-- Sección process_steps con 4 bloques (pasos del proceso artesanal)
DO $$
DECLARE
  home_id UUID;
  sec_id UUID;
BEGIN
  SELECT id INTO home_id FROM cms_pages WHERE slug = 'home' LIMIT 1;
  IF home_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM cms_sections WHERE page_id = home_id AND section_type = 'process_steps' LIMIT 1) THEN
    INSERT INTO cms_sections (page_id, section_type, title_es, sort_order)
    VALUES (home_id, 'process_steps', 'Proceso artesanal, del boceto al ajuste final', 55)
    RETURNING id INTO sec_id;

    INSERT INTO cms_blocks (section_id, block_type, title_es, content_es, sort_order)
    VALUES
      (sec_id, 'text', 'Toma de medidas',
       'Una de las claves de la sastrería a medida es la precisión. En Sastrería Prats realizamos una toma de medidas completa, analizando no solo las dimensiones del cuerpo, sino también la postura, la caída de los hombros y la forma natural del cliente. Este estudio permite crear un patrón único que garantiza comodidad, equilibrio y una silueta elegante.',
       10),
      (sec_id, 'text', 'Patronaje personalizado',
       'Con las medidas definidas se elabora el patrón personalizado, el plano técnico que dará forma al traje. Posteriormente se realiza el corte del tejido seleccionado, siempre respetando la dirección de la fibra y las características del material. Este paso es fundamental para asegurar que la prenda mantenga su estructura y caída con el paso del tiempo.',
       20),
      (sec_id, 'text', 'Pruebas de ajuste',
       'Un traje verdaderamente a medida requiere varias pruebas. En ellas se evalúa cómo se comporta la prenda sobre el cuerpo del cliente y se realizan los ajustes necesarios. En estas pruebas se corrigen detalles como la longitud de mangas y pantalones, la caída de la chaqueta, el ajuste en cintura y hombros, y la movilidad general del traje. Cada modificación se realiza con precisión para alcanzar un resultado perfecto.',
       30),
      (sec_id, 'text', 'Acabados a mano',
       'La confección se realiza mediante técnicas tradicionales de sastrería. Muchas partes del traje se cosen a mano, especialmente aquellas que influyen en la estructura y la movilidad de la prenda. Durante esta fase se ensamblan elementos como la estructura del pecho, las solapas, las mangas y el forro interior. El objetivo es construir una prenda que combine durabilidad, confort y elegancia.',
       40);
  END IF;
END $$;
