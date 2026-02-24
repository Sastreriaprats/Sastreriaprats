-- ==========================================
-- Comprobar qué migraciones parecen aplicadas
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ==========================================
-- Cada fila indica si existe un objeto (tabla/columna) que introduce esa migración.
-- "Sí" = probablemente aplicada. "No" = falta aplicar esa migración.

SELECT '001_auth_roles_stores' AS migration,
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stores') THEN 'Sí' ELSE 'No' END AS aplicada
UNION ALL
SELECT '002_clients_measurements_suppliers',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'garment_types') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '003a_products_stock',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '003b_tailoring_orders',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tailoring_orders') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '003c_pos_cash',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cash_sessions') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '003d_accounting',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'journal_entries') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '004_appointments',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'appointments') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '005_cms',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cms_pages') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '006_online_orders',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'online_orders') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '007_client_wishlist',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'client_wishlist') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '008_email_system',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'email_templates') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '009_migration_system',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'migration_logs') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '010_roles_v2',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '011_officials_permissions',
  CASE WHEN EXISTS (SELECT 1 FROM permissions WHERE code LIKE 'officials.%' LIMIT 1) THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '012_officials_table',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'officials') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '013_officials_rls',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'officials' AND policyname = 'officials_select') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '015_sync_schema',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tailoring_orders' AND column_name = 'official_id') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '016_estimates_rls',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estimates' AND policyname = 'estimates_select') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '017_manual_transactions',
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'manual_transactions') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '018_sales_journal_entry_id',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'journal_entry_id') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '019_online_orders_payment_reference',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'online_orders' AND column_name = 'payment_reference') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '020_estimates_pdf_url_documents_bucket',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'pdf_url') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '021_product_categories_by_type',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_categories' AND column_name = 'product_type') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '022_products_fabric_meters_used',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'fabric_meters_used') THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '023_deactivate_industrial_garment_type',
  CASE WHEN NOT EXISTS (SELECT 1 FROM garment_types WHERE code = 'industrial' AND is_active = TRUE) THEN 'Sí' ELSE 'No' END
UNION ALL
SELECT '024_client_measurements_body_type_id',
  CASE WHEN EXISTS (SELECT 1 FROM garment_types WHERE code = 'body' AND is_active = TRUE) THEN 'Sí (comprobar datos manualmente)' ELSE 'No / Sin tipo body' END
ORDER BY migration;
