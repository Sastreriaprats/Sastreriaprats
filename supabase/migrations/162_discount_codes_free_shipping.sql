-- 162_discount_codes_free_shipping.sql
-- Añade flag free_shipping a discount_codes para cupones que incluyen envío gratuito.

ALTER TABLE discount_codes
  ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN DEFAULT FALSE NOT NULL;
