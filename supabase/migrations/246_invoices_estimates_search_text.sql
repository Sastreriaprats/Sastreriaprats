-- Migration 246: columnas search_text en invoices y estimates
--
-- Igual que la mig 142 (clients, products, suppliers, vouchers, fabrics,
-- ap_supplier_invoices): añade una columna generada `search_text` con
-- lower + f_unaccent sobre número + nombre de cliente, más un índice GIN trigram.
--
-- Motivo: el buscador de facturas/presupuestos hacía .or() sobre `client_name`
-- crudo (con tildes) → ni multi-palabra ni acento-insensible. Con esta columna
-- el buscador tokeniza igual que el resto (cada token AND sobre search_text),
-- y "pablo salvador" / "miró"="miro" funcionan. El número va incluido en la
-- columna, así que la búsqueda por nº de factura/presupuesto sigue casando.

-- ── invoices ─────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(
    coalesce(invoice_number,'') || ' ' ||
    coalesce(client_name,'')
  ))
) STORED;

-- ── estimates ────────────────────────────────────────────────────────
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS search_text text GENERATED ALWAYS AS (
  lower(f_unaccent(
    coalesce(estimate_number,'') || ' ' ||
    coalesce(client_name,'')
  ))
) STORED;

-- ── Índices GIN trigram ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_search_text ON invoices USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_estimates_search_text ON estimates USING gin (search_text gin_trgm_ops);
