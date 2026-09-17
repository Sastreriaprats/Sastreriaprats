-- ============================================================================
-- 287 · DATOS DE FACTURA EN EL PEDIDO ONLINE
-- ----------------------------------------------------------------------------
-- Petición de David (17-sep-2026): desde la mig 286 el pedido online genera
-- TICKET. Quien quiera FACTURA lo pide en el checkout rellenando todos los datos
-- fiscales (nombre o razón social, NIF/CIF, dirección, CP, ciudad, provincia y
-- país). Con esos datos el webhook emite la factura W en lugar del ticket.
--
-- `billing` NULL = el cliente no pidió factura. Viaja del checkout al pedido
-- pendiente (Redsys) y de ahí al pedido definitivo, igual que `customer`.
-- ============================================================================

ALTER TABLE public.pending_online_orders ADD COLUMN IF NOT EXISTS billing jsonb;
ALTER TABLE public.online_orders         ADD COLUMN IF NOT EXISTS billing jsonb;

COMMENT ON COLUMN public.online_orders.billing IS
  'Datos fiscales si el cliente pidió factura en el checkout: {name, tax_id, address, postal_code, city, province, country}. NULL = ticket.';
