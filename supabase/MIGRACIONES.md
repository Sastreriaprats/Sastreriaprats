# Lista de migraciones (orden de aplicación)

Aplicar **en este orden** si las ejecutas a mano en el SQL Editor de Supabase.  
Para comprobar cuáles están ya aplicadas en tu base de datos, usa el script `scripts/check-migrations.sql` en el SQL Editor.

| # | Archivo | Descripción breve |
|---|---------|-------------------|
| 1 | `001_auth_roles_stores.sql` | Auth, roles, tiendas, almacenes, permisos base |
| 2 | `002_clients_measurements_suppliers.sql` | Clientes, medidas, proveedores, garment_types, measurement_fields |
| 3 | `003a_products_stock.sql` | Productos y stock |
| 4 | `003b_tailoring_orders.sql` | Pedidos a medida (tailoring_orders) |
| 5 | `003c_pos_cash.sql` | TPV / caja |
| 6 | `003d_accounting.sql` | Contabilidad (cuentas, asientos, sales) |
| 7 | `004_appointments.sql` | Citas / reservas |
| 8 | `005_cms.sql` | CMS: páginas, blog, contacto |
| 9 | `006_online_orders.sql` | Pedidos online (online_orders) |
| 10 | `007_client_wishlist.sql` | Favoritos / wishlist de cliente |
| 11 | `008_email_system.sql` | Emails: plantillas, campañas, logs |
| 12 | `009_migration_system.sql` | Sistema de migración de datos (migration_logs) |
| 13 | `010_roles_v2.sql` | Roles v2, permisos granulares, audit_log |
| 14 | `011_officials_permissions.sql` | Permisos módulo Oficiales |
| 15 | `012_officials_table.sql` | Tabla officials (oficiales/sastres externos) |
| 16 | `013_officials_rls.sql` | RLS para officials |
| 17 | `015_sync_schema.sql` | Sincronización schema (columnas añadidas fuera de migraciones) |
| 18 | `016_estimates_rls.sql` | RLS para presupuestos (estimates, estimate_lines) |
| 19 | `017_manual_transactions.sql` | Movimientos contables manuales (manual_transactions) |
| 20 | `018_sales_journal_entry_id.sql` | Vincular ventas con asiento contable |
| 21 | `019_online_orders_payment_reference.sql` | Referencia de pago en pedidos online |
| 22 | `020_estimates_pdf_url_documents_bucket.sql` | pdf_url en presupuestos |
| 23 | `021_product_categories_by_type.sql` | Categorías por tipo (boutique, tejidos, etc.) |
| 24 | `022_products_fabric_meters_used.sql` | Metros de tejido gastados en productos |
| 25 | `023_deactivate_industrial_garment_type.sql` | Desactivar tipo de prenda "Industrial" |
| 26 | `024_client_measurements_body_type_id.sql` | Reasignar medidas cliente al tipo body |

**Nota:** No existe migración `014` en el proyecto.

---

## Cómo aplicar pendientes

### Opción A: Supabase CLI (recomendado si usas link)

1. Enlaza el proyecto: `supabase link --project-ref TU_PROJECT_REF`
2. Ver estado: `supabase migration list --linked`
3. Aplicar pendientes: `supabase db push --linked`  
   (O solo simular: `supabase db push --linked --dry-run`)

### Opción B: Manual en Dashboard

1. Abre **Supabase Dashboard** → tu proyecto → **SQL Editor**.
2. Ejecuta el script `scripts/check-migrations.sql` para ver qué migraciones parecen ya aplicadas.
3. Abre cada archivo de `supabase/migrations/` que marque como **no aplicada**, en orden, y ejecuta su contenido en el SQL Editor.
