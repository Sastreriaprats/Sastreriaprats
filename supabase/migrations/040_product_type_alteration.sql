-- Tipos de producto: añadir "Arreglo" (alteration) y permitir en categorías
-- Se mantiene "accessory" en el enum por datos existentes; en la UI solo se ofrecen Boutique, Tela, Arreglo, Servicio.

ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'alteration';

ALTER TABLE product_categories DROP CONSTRAINT IF EXISTS product_categories_product_type_check;
ALTER TABLE product_categories ADD CONSTRAINT product_categories_product_type_check
  CHECK (product_type IS NULL OR product_type IN ('boutique', 'tailoring_fabric', 'accessory', 'service', 'alteration'));
