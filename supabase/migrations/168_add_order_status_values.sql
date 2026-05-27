-- Añade los 5 estados nuevos al enum tailoring_order_status sin quitar
-- los viejos. El commit 3 hará el switch completo y backfill.
-- Los valores se insertan en posición lógica (no al final) para que el
-- orden del enum refleje el flujo natural del pedido.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de un
-- bloque DO/anónimo, pero sí dentro de una transacción simple. Si tu
-- Supabase SQL Editor falla con "ALTER TYPE ... ADD cannot run inside a
-- transaction block", ejecuta cada statement por separado.

ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'fabric_received_store' AFTER 'fabric_received';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'fabric_received_factory' AFTER 'fabric_received_store';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'cut' AFTER 'fabric_received_factory';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'in_fitting' AFTER 'in_production';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'received_in_store' AFTER 'in_fitting';

COMMENT ON TYPE tailoring_order_status IS 'Estados del pedido. Modelo nuevo: created → fabric_ordered → (fabric_received_store|fabric_received_factory) → (cut|/) → in_production → (in_fitting|/) → (received_in_store|/) → finished → delivered. Valores legacy (factory_ordered, fitting, adjustments, y huérfanos de mig 059) pendientes de eliminar en migración 169.';
