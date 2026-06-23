-- ============================================================
-- Migración 231: motor de comisiones de VENDEDORES (configurable).
--
-- Distinto de las comisiones de OFICIALES (R9, migs 226-230, tabla
-- official_settlements): aquello es lo que gana el sastre por confeccionar una
-- prenda. ESTO es lo que gana un vendedor/empleado por su venta.
--
-- DISEÑO (decisiones del usuario, jun-2026):
--  - Objetivo que manda = el INDIVIDUAL del empleado (employee_monthly_goals).
--  - Umbral SEPARADO por bloque: la venta de boutique se compara con el objetivo
--    de boutique y la de sastrería con el de sastrería; cada bloque con su propio
--    tramo (% por debajo del objetivo / % por encima).
--  - Base SIN IVA (base imponible), medida IGUAL que los Objetivos
--    (sales.salesperson_id, total - tax_amount, bucket por sale_type). Esa
--    coherencia es obligatoria: el % "sobre/bajo objetivo" solo tiene sentido si
--    base y objetivo se miden con la misma vara.
--  - Bonus grupal trimestral aparte (regla configurable): si TODAS las tiendas
--    listadas superan su objetivo del trimestre, se reparte un % del EXCESO
--    conjunto entre los empleados beneficiarios.
--
-- Permisos: ver = reports.view ; escribir/configurar = config.edit (igual que los
-- Objetivos). El cálculo del informe va por service-role (bypassa RLS); la RLS es
-- defensa en profundidad.
-- ============================================================

-- ── Plan de comisión (regla de tramos) ──────────────────────────────────────
CREATE TABLE commission_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  store_id        uuid NULL REFERENCES stores(id) ON DELETE SET NULL,  -- informativo (tienda típica del plan)

  -- Qué cuenta como base de la comisión (todas SIN IVA, por salesperson_id):
  base_boutique   boolean NOT NULL DEFAULT true,   -- ventas de producto de tienda (sale_type 'boutique')
  base_gift_cards boolean NOT NULL DEFAULT false,  -- tarjetas regalo (sale_type 'gift_card') → suma al bloque boutique
  base_sastreria  boolean NOT NULL DEFAULT false,  -- sastrería vendida en TPV (tailoring_deposit/final/alteration)

  -- Tramos. rate_below se aplica hasta el objetivo del bloque; rate_above al exceso.
  -- Porcentajes en puntos (1.5 = 1,5 %).
  rate_below      numeric(6,3) NOT NULL DEFAULT 0,
  rate_above      numeric(6,3) NOT NULL DEFAULT 0,

  -- use_target=false → tarifa PLANA: rate_below se aplica a TODA la base, sin
  -- comparar objetivo (caso "Ismael 1 % de su boutique").
  use_target      boolean NOT NULL DEFAULT true,

  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_commission_plans_active ON commission_plans(is_active);

-- ── Asignación empleado → plan (un plan activo por empleado) ─────────────────
CREATE TABLE commission_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id     uuid NOT NULL REFERENCES commission_plans(id) ON DELETE CASCADE,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)   -- un empleado, un plan
);
CREATE INDEX idx_commission_assignments_plan ON commission_assignments(plan_id);

-- ── Bonus grupal (p.ej. trimestral, repartido entre varios empleados) ────────
CREATE TABLE commission_group_bonuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  period_type text NOT NULL DEFAULT 'quarter',         -- 'quarter' | 'month' | 'year'
  rate        numeric(6,3) NOT NULL DEFAULT 0,          -- % a repartir (1.5 = 1,5 %)
  base_type   text NOT NULL DEFAULT 'excess',           -- 'excess' (sobre el exceso) | 'total' (sobre la venta)
  goal_types  text[] NOT NULL DEFAULT ARRAY['boutique','sastreria'],  -- tipos de objetivo de tienda que cuentan
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Tiendas que TODAS deben superar su objetivo para que el bonus se active.
CREATE TABLE commission_group_bonus_stores (
  bonus_id uuid NOT NULL REFERENCES commission_group_bonuses(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (bonus_id, store_id)
);

-- Empleados entre los que se reparte el bonus (a partes iguales).
CREATE TABLE commission_group_bonus_members (
  bonus_id    uuid NOT NULL REFERENCES commission_group_bonuses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (bonus_id, employee_id)
);

-- ── RLS (defensa en profundidad; patrón del proyecto) ────────────────────────
ALTER TABLE commission_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_group_bonuses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_group_bonus_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_group_bonus_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commission_plans','commission_assignments','commission_group_bonuses',
    'commission_group_bonus_stores','commission_group_bonus_members'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (user_has_permission(auth.uid(), ''reports.view'') OR user_has_permission(auth.uid(), ''config.edit''))',
      t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (user_has_permission(auth.uid(), ''config.edit''))', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (user_has_permission(auth.uid(), ''config.edit'')) WITH CHECK (user_has_permission(auth.uid(), ''config.edit''))', t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (user_has_permission(auth.uid(), ''config.edit''))', t || '_delete', t);
  END LOOP;
END $$;
