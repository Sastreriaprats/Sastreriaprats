-- ============================================================
-- Migration 142: columnas search_text generadas con unaccent
--
-- Problema: los buscadores admin usan .ilike() (case-insensitive) pero
-- NO normalizan acentos, así que "jose" no encuentra "José", "tunez"
-- no encuentra "Túnez". La extensión unaccent ya está instalada
-- (mig. 134) pero solo se usa en slugify de temporadas, no en búsqueda.
--
-- Solución: añadir una columna generada `search_text` a las 6 tablas
-- principales con `lower(unaccent(...))` de los campos típicos de
-- búsqueda, e indexarla con GIN trigram. PostgREST no permite usar
-- funciones en filtros, pero sí ve columnas generadas como columnas
-- normales — el queryList puede hacer .ilike('search_text', '%term%')
-- con el término ya normalizado en JS antes de enviarlo.
--
-- NOTA: la extensión unaccent expone `unaccent(text)` como STABLE, no
-- IMMUTABLE, y Postgres exige IMMUTABLE para columnas generadas. Se
-- resuelve con un wrapper f_unaccent declarado IMMUTABLE asumiendo que
-- el diccionario unaccent.rules no cambia en runtime (práctica estándar).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Wrapper IMMUTABLE necesario para columnas generadas.
CREATE OR REPLACE FUNCTION public.f_unaccent(t text)
  RETURNS text LANGUAGE sql IMMUTABLE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- ── clients ─────────────────────────────────────────────────────────
-- NOTA: `full_name` es una columna generada en `clients` (`first_name || last_name`).
-- Postgres no permite que una generated column referencie otra generated column,
-- así que componemos `search_text` con los campos base `first_name` + `last_name`.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(
    coalesce(first_name,'') || ' ' ||
    coalesce(last_name,'') || ' ' ||
    coalesce(email,'') || ' ' ||
    coalesce(phone,'') || ' ' ||
    coalesce(document_number,'') || ' ' ||
    coalesce(client_code,'')
  ))
) STORED;

-- ── products ────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(
    coalesce(name,'') || ' ' ||
    coalesce(sku,'') || ' ' ||
    coalesce(barcode,'')
  ))
) STORED;

-- ── suppliers ───────────────────────────────────────────────────────
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(
    coalesce(name,'') || ' ' ||
    coalesce(legal_name,'') || ' ' ||
    coalesce(contact_email,'') || ' ' ||
    coalesce(contact_name,'') || ' ' ||
    coalesce(nif_cif,'')
  ))
) STORED;

-- ── vouchers ────────────────────────────────────────────────────────
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(coalesce(code,'')))
) STORED;

-- ── fabrics ─────────────────────────────────────────────────────────
ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(
    coalesce(name,'') || ' ' ||
    coalesce(fabric_code,'')
  ))
) STORED;

-- ── ap_supplier_invoices ────────────────────────────────────────────
ALTER TABLE ap_supplier_invoices ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(
    coalesce(invoice_number,'') || ' ' ||
    coalesce(supplier_name,'')
  ))
) STORED;

-- ── Índices GIN trigram ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_search_text ON clients USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_text ON products USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_search_text ON suppliers USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vouchers_search_text ON vouchers USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_fabrics_search_text ON fabrics USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ap_supplier_invoices_search_text ON ap_supplier_invoices USING gin (search_text gin_trgm_ops);
