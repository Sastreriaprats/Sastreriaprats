-- ============================================================================
-- Migración 134: Objetivos mensuales por empleado dentro de cada tienda
-- ============================================================================
-- Una fila por (tienda, empleado, año, mes, tipo). Tipos: 'boutique' | 'sastreria'.
-- Los objetivos por empleado son ADITIVOS al objetivo de tienda; no lo reemplazan.
-- El cumplimiento se mide agregando ventas (sales) por salesperson_id en el mes.
-- Importes en base imponible (sin IVA), igual que store_monthly_goals.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_monthly_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id)   ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year          integer NOT NULL,
  month         integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  goal_type     text    NOT NULL CHECK (goal_type IN ('boutique', 'sastreria')),
  target_amount numeric(12, 2) NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_monthly_goals_unique UNIQUE (store_id, employee_id, year, month, goal_type)
);

CREATE INDEX IF NOT EXISTS idx_employee_monthly_goals_lookup
  ON public.employee_monthly_goals (year, month, store_id);

CREATE INDEX IF NOT EXISTS idx_employee_monthly_goals_employee
  ON public.employee_monthly_goals (employee_id, year, month);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.employee_monthly_goals_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_monthly_goals_updated_at ON public.employee_monthly_goals;
CREATE TRIGGER trg_employee_monthly_goals_updated_at
  BEFORE UPDATE ON public.employee_monthly_goals
  FOR EACH ROW EXECUTE FUNCTION public.employee_monthly_goals_set_updated_at();

ALTER TABLE public.employee_monthly_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_monthly_goals_read ON public.employee_monthly_goals;
CREATE POLICY employee_monthly_goals_read
  ON public.employee_monthly_goals FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS employee_monthly_goals_manage ON public.employee_monthly_goals;
CREATE POLICY employee_monthly_goals_manage
  ON public.employee_monthly_goals FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
