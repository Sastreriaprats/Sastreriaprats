-- ==========================================
-- SASTRERÍA PRATS — Migración 100
-- Reservas de productos (product_reservations)
-- ==========================================
-- Añade una tabla para reservar variantes a clientes concretos,
-- reutilizando stock_levels.reserved como fuente de verdad del
-- stock bloqueado. Toda la mutación pasará por los RPCs 101-105.

-- 1. Enum de estado de la reserva
DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM (
    'active',         -- stock bloqueado en stock_levels.reserved
    'pending_stock',  -- esperando recepción de mercancía
    'fulfilled',      -- consumida en una venta
    'cancelled',      -- anulada manualmente
    'expired'         -- venció sin ser consumida
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabla principal
CREATE TABLE IF NOT EXISTS product_reservations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_number VARCHAR(30) UNIQUE NOT NULL,
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  warehouse_id       UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  store_id           UUID REFERENCES stores(id) ON DELETE SET NULL,
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  status             reservation_status NOT NULL DEFAULT 'active',
  notes              TEXT,
  reason             TEXT,
  expires_at         TIMESTAMPTZ,
  fulfilled_sale_id  UUID REFERENCES sales(id) ON DELETE SET NULL,
  fulfilled_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  cancelled_reason   TEXT,
  stock_reserved_at  TIMESTAMPTZ,
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_prod_res_client          ON product_reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_prod_res_variant         ON product_reservations(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_prod_res_status          ON product_reservations(status);
CREATE INDEX IF NOT EXISTS idx_prod_res_warehouse       ON product_reservations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_prod_res_variant_active
  ON product_reservations(product_variant_id, warehouse_id)
  WHERE status IN ('active', 'pending_stock');
CREATE INDEX IF NOT EXISTS idx_prod_res_client_variant_active
  ON product_reservations(client_id, product_variant_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_prod_res_created_at_desc ON product_reservations(created_at DESC);

-- 4. Trigger updated_at
CREATE TRIGGER trigger_product_reservations_updated_at
  BEFORE UPDATE ON product_reservations
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- 5. Función de numeración (formato RSV-YYYY-NNNN, anual)
CREATE OR REPLACE FUNCTION generate_reservation_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  v_next INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(NULLIF(SPLIT_PART(reservation_number, '-', 3), '')::INTEGER),
    0
  ) + 1
  INTO v_next
  FROM product_reservations
  WHERE reservation_number LIKE 'RSV-' || v_year || '-%';

  RETURN 'RSV-' || v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- 6. RLS
ALTER TABLE product_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_reservations_select" ON product_reservations;
CREATE POLICY "product_reservations_select" ON product_reservations FOR SELECT
  USING (user_has_permission(auth.uid(), 'reservations.view'));

DROP POLICY IF EXISTS "product_reservations_insert" ON product_reservations;
CREATE POLICY "product_reservations_insert" ON product_reservations FOR INSERT
  WITH CHECK (user_has_permission(auth.uid(), 'reservations.create'));

DROP POLICY IF EXISTS "product_reservations_update" ON product_reservations;
CREATE POLICY "product_reservations_update" ON product_reservations FOR UPDATE
  USING (user_has_permission(auth.uid(), 'reservations.edit'));

DROP POLICY IF EXISTS "product_reservations_delete" ON product_reservations;
CREATE POLICY "product_reservations_delete" ON product_reservations FOR DELETE
  USING (user_has_permission(auth.uid(), 'reservations.delete'));

-- 7. Nuevos permisos
INSERT INTO permissions (code, module, action, display_name, category)
VALUES
  ('reservations.view',   'reservations', 'view',   'Ver reservas',      'Reservas'),
  ('reservations.create', 'reservations', 'create', 'Crear reservas',    'Reservas'),
  ('reservations.edit',   'reservations', 'edit',   'Editar reservas',   'Reservas'),
  ('reservations.delete', 'reservations', 'delete', 'Cancelar reservas', 'Reservas')
ON CONFLICT (code) DO NOTHING;

-- 8. Asignación de permisos a roles
-- Administrador: todo
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'administrador'
  AND p.code IN ('reservations.view', 'reservations.create', 'reservations.edit', 'reservations.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Vendedor avanzado y sastre plus: todo
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('vendedor_avanzado', 'sastre_plus')
  AND p.code IN ('reservations.view', 'reservations.create', 'reservations.edit', 'reservations.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Vendedor básico: ver + crear + editar (sin cancelar)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'vendedor_basico'
  AND p.code IN ('reservations.view', 'reservations.create', 'reservations.edit')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Sastre: solo lectura
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'sastre'
  AND p.code = 'reservations.view'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
