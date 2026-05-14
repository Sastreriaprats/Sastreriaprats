-- ============================================================
-- Migration 071: DROP boutique_alterations (módulo viejo)
--
-- El nuevo módulo `alterations` (mig. 068) reemplaza por completo a
-- `boutique_alterations`. Estaba vacía en producción (verificado el
-- 2026-05-14), así que no hay datos que migrar. El oficial se referencia
-- a la tabla compartida `officials` (mig. 012) tras la mig. 070.
--
-- ⚠ NO EJECUTAR todavía: revisar primero que no queda código apuntando
-- a `boutique_alterations` y que el módulo nuevo funciona en pre-producción.
-- ============================================================

DROP TABLE IF EXISTS boutique_alterations CASCADE;
