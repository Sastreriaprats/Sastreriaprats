-- ==========================================
-- SASTRERÍA PRATS — Migración 124
-- Recepción parcial de traspasos
-- ==========================================
-- Añade 'partial' al enum transfer_status para cuando
-- la tienda destino recibe menos unidades de las solicitadas.
-- Las columnas quantity_received y quantity_sent ya existen
-- en stock_transfer_lines (definidas en 003a_products_stock.sql).

ALTER TYPE transfer_status ADD VALUE IF NOT EXISTS 'partial';
