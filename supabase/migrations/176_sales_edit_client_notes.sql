-- ============================================================
-- Migración 176 (Fase E1): editar cliente y notas de una venta ya hecha.
--
-- 1) Permiso sales.edit (editar ventas de TPV), asignado a administrador.
--    Reutilizable para E2 (método de pago) y E3 (líneas). Tras crearlo,
--    es reasignable a otros roles desde la pantalla de permisos (sin SQL).
--
-- 2) RPC rpc_update_sale_client_notes: actualiza de forma ATÓMICA el
--    cliente y/o las notas de la venta y, si tiene factura, sincroniza el
--    snapshot de cliente de la factura. NO toca dinero, stock, caja ni asiento.
--
-- Cerrojo: si la factura ya se envió a Hacienda (verifactu_sent) y se intenta
-- CAMBIAR el cliente, se bloquea (requeriría rectificativa). Las notas se
-- pueden cambiar siempre.
--
-- El snapshot del cliente (name/nif/address/email/phone) lo calcula la server
-- action con formatClientAddress (consistente con cómo se creó la factura) y
-- se pasa como JSONB; la RPC solo lo aplica.
-- ============================================================

INSERT INTO permissions (code, module, action, display_name, description, category, is_sensitive)
VALUES (
  'sales.edit', 'sales', 'edit', 'Editar ventas',
  'Editar cliente, notas y datos de una venta de TPV ya realizada.',
  'Contabilidad', true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador' AND p.code = 'sales.edit'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.rpc_update_sale_client_notes(
  p_sale_id        uuid,
  p_client_id      uuid,
  p_notes          text,
  p_client_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale    RECORD;
  v_invoice RECORD;
  v_changed boolean;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venta no encontrada');
  END IF;

  v_changed := p_client_id IS DISTINCT FROM v_sale.client_id;

  SELECT * INTO v_invoice FROM invoices WHERE sale_id = p_sale_id LIMIT 1;

  -- Cerrojo: no cambiar el cliente si la factura ya está en Verifactu.
  IF v_changed AND v_invoice.id IS NOT NULL AND v_invoice.verifactu_sent = true THEN
    RETURN jsonb_build_object('success', false, 'error',
      'La factura se ha enviado a Hacienda (Verifactu); no se puede cambiar el cliente. Emite una rectificativa.');
  END IF;

  UPDATE sales SET client_id = p_client_id, notes = p_notes, updated_at = now()
   WHERE id = p_sale_id;

  -- Sincronizar snapshot de cliente en la factura (solo si el cliente cambió).
  IF v_changed AND v_invoice.id IS NOT NULL THEN
    UPDATE invoices SET
      client_id      = p_client_id,
      client_name    = COALESCE(p_client_snapshot->>'name', 'Consumidor final'),
      client_nif     = p_client_snapshot->>'nif',
      client_address = p_client_snapshot->>'address',
      client_email   = p_client_snapshot->>'email',
      client_phone   = p_client_snapshot->>'phone',
      updated_at     = now()
    WHERE id = v_invoice.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'client_changed', v_changed,
    'invoice_updated', (v_changed AND v_invoice.id IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_sale_client_notes(uuid, uuid, text, jsonb) TO service_role, authenticated;
