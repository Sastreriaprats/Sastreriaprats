-- ============================================================================
-- Migración 125: Objetivos mensuales por tienda
-- ============================================================================
-- Una fila por (tienda, año, mes, tipo). Tipos: 'boutique' | 'sastreria'.
-- El dashboard compara target_amount con la facturación agregada del mes
-- correspondiente, filtrando sales.sale_type según el grupo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_monthly_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  year          integer NOT NULL,
  month         integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  goal_type     text    NOT NULL CHECK (goal_type IN ('boutique', 'sastreria')),
  target_amount numeric(12, 2) NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_monthly_goals_unique UNIQUE (store_id, year, month, goal_type)
);

CREATE INDEX IF NOT EXISTS idx_store_monthly_goals_lookup
  ON public.store_monthly_goals (year, month, store_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.store_monthly_goals_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_monthly_goals_updated_at ON public.store_monthly_goals;
CREATE TRIGGER trg_store_monthly_goals_updated_at
  BEFORE UPDATE ON public.store_monthly_goals
  FOR EACH ROW EXECUTE FUNCTION public.store_monthly_goals_set_updated_at();

-- RLS: lectura/escritura vía service role (las server actions usan admin client)
ALTER TABLE public.store_monthly_goals ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a usuarios autenticados (el widget del dashboard lo consume)
DROP POLICY IF EXISTS store_monthly_goals_read ON public.store_monthly_goals;
CREATE POLICY store_monthly_goals_read
  ON public.store_monthly_goals FOR SELECT
  TO authenticated
  USING (true);
