-- ============================================================================
-- Migración 128: Añadir tipo 'online' a objetivos mensuales por tienda
-- ============================================================================
-- La tienda que hospeda el canal online (Hermanos Pinzón) pasa a tener un
-- tercer objetivo mensual: 'online'. Las ventas online viven en la tabla
-- online_orders y se agregan solo para esa tienda.
-- ============================================================================

ALTER TABLE public.store_monthly_goals
  DROP CONSTRAINT IF EXISTS store_monthly_goals_goal_type_check;

ALTER TABLE public.store_monthly_goals
  ADD CONSTRAINT store_monthly_goals_goal_type_check
  CHECK (goal_type IN ('boutique', 'sastreria', 'online'));
