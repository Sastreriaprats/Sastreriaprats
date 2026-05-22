-- ============================================================
-- Migración 165: vendedor_avanzado puede emitir facturas desde TPV
--
-- Motivo: Mónica aprobó que los vendedores avanzados puedan emitir
-- facturas desde el TPV (botón "Factura" en pos-sale-screen y
-- pos-summary). El flujo es:
--   1. createInvoiceFromSaleAction({ saleId })   -> accounting.manage_invoices
--   2. generateInvoicePdfAction(invoice.id)      -> accounting.manage_invoices
--   3. window.open(pdfUrl)                       -> abre PDF desde Storage
--
-- NO se concede accounting.view a propósito: ese permiso abriría
-- /admin/contabilidad (listado de facturas, presupuestos, movs.),
-- que Mónica NO quiere exponer al vendedor.
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- ============================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'vendedor_avanzado'
  AND p.code = 'accounting.manage_invoices'
ON CONFLICT DO NOTHING;
