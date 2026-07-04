// Contexto de esquema que se inyecta al LLM (Kimi) para que traduzca preguntas en
// lenguaje natural a SQL de solo lectura sobre la BD de Sastrería Prats.
//
// Se describen SOLO las tablas/columnas relevantes para consultas de negocio
// (ventas, cajas, comisiones, stock, empleados, pedidos). No es el esquema
// completo; si el modelo necesita algo que no está aquí, debe decir que no puede
// responderlo en lugar de inventar tablas.

export const DB_SCHEMA_CONTEXT = `
Base de datos PostgreSQL (Supabase) de "Sastrería Prats". Reglas de negocio y tablas:

## Reglas generales
- Todos los timestamps (created_at, opened_at, etc.) se guardan en UTC.
- Para filtrar por día/mes en hora local usa SIEMPRE: (columna AT TIME ZONE 'Europe/Madrid')::date.
  - "hoy" = (created_at AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date
- Importes: las columnas *total*, *amount* incluyen IVA. La BASE sin IVA de una venta = total - tax_amount.
- Formatea nombres legibles; los ids son uuid.

## Tiendas: tabla "stores"
- id (uuid), code (varchar): 'PIN'=Hermanos Pinzón, 'WEL'=Wellington, 'WEB'=Tienda Online.
- name, display_name, store_type ('physical'|'online'|'warehouse'), is_active.
- "Boutique" y "sastrería" NO son tiendas: son canales dentro de cada tienda física (por sale_type).

## Cajas / sesiones de caja: tabla "cash_sessions"
Una "caja" = una sesión de caja de una tienda.
- id, store_id -> stores.id, status ('open'|'closed').
- opened_at, closed_at (timestamptz), opening_amount.
- total_cash_sales, total_card_sales, total_bizum_sales, total_transfer_sales, total_voucher_sales, total_sales (numeric, ya con IVA).
- total_returns, total_withdrawals, expected_cash, counted_cash, cash_difference.
- opened_by, closed_by -> profiles.id.
Tabla "cash_withdrawals": cash_session_id, amount, reason, withdrawn_at (retiradas de caja).

## Ventas: tabla "sales"
- id, ticket_number, created_at (fecha de la venta), store_id -> stores.id, cash_session_id -> cash_sessions.id.
- salesperson_id -> profiles.id (VENDEDOR).
- client_id -> clients.id.
- sale_type (text): 'boutique', 'tailoring_deposit', 'tailoring_final', 'alteration', 'online', 'gift_card'.
  - Boutique = 'boutique'; Sastrería (TPV) = ('tailoring_deposit','tailoring_final','alteration'); Tarjetas regalo = 'gift_card'; Online = 'online'.
- subtotal, discount_amount, tax_amount, total (numeric, con IVA), total_returned.
- payment_method ('cash'|'card'|'bizum'|'transfer'|'voucher'|'mixed').
- status ('completed'|'partially_returned'|'fully_returned'|'voided'). Para facturación real filtra status <> 'voided'.
- tailoring_order_id -> tailoring_orders.id (si la venta es de un pedido de sastrería).

## Líneas de venta: tabla "sale_lines"
- sale_id -> sales.id, product_variant_id, description, sku, quantity, unit_price, tax_rate (default 21), line_total (con IVA), quantity_returned.

## Cobros de venta: tabla "sale_payments"
- sale_id -> sales.id, payment_method, amount, cash_session_id, created_at.

## Pedidos de sastrería (backoffice): tabla "tailoring_orders"
- id, store_id, order_date (date), total, total_paid, total_pending, status, order_type ('artesanal'|'industrial'), created_by -> profiles.id.
## Cobros de sastrería backoffice: tabla "tailoring_order_payments"
- tailoring_order_id -> tailoring_orders.id, payment_date (date), payment_method ('cash'|'card'|'transfer'|'check'), amount, cash_session_id.
- FACTURACIÓN DE SASTRERÍA = ventas POS con sale_type IN ('tailoring_deposit','tailoring_final','alteration') MÁS los tailoring_order_payments del backoffice. No las mezcles dos veces con líneas que ya tengan tailoring_order_id.

## Comisiones de vendedores (motor configurable)
- "commission_plans": id, name, store_id, base_boutique, base_gift_cards, base_sastreria (bool), rate_below, rate_above (numeric, % por unidad ej 0.03=3%), use_target (bool), is_active.
- "commission_assignments": employee_id -> profiles.id, plan_id -> commission_plans.id (puede ser NULL), is_active.
- La base de comisión de un vendedor se mide sobre sus ventas (sales.salesperson_id) SIN IVA (total - tax_amount), por sale_type según el plan. El cálculo exacto es lógica de aplicación; para consultas simples puedes estimar la base de ventas de un vendedor en un periodo.
- "employee_monthly_goals": employee_id, year, month, goal_type, target_amount (objetivo mensual del empleado).

## Empleados / vendedores: tabla "profiles"
- id (uuid), full_name (nombre a mostrar), email, is_active.
- Vendedor de una venta: sales.salesperson_id -> profiles.id.
- Roles: user_roles -> roles; tiendas asignadas: user_stores (user_id, store_id, is_primary).

## Stock / productos
- "products": id, sku, name, product_type ('boutique'|'tailoring_fabric'|'accessory'|'service'|'alteration'), base_price, tax_rate, is_active, min_stock_alert.
- "product_variants": id, product_id -> products.id, size (talla), color, variant_sku, barcode.
- "stock_levels": product_variant_id -> product_variants.id, warehouse_id -> warehouses.id, quantity (físico), reserved, available (=quantity-reserved), min_stock.
- "warehouses": id, store_id -> stores.id (para stock por tienda: stock_levels JOIN warehouses JOIN stores).
- Para "stock de X prenda": JOIN products p -> product_variants v -> stock_levels s; filtra p.name/p.sku ILIKE '%X%'.

## Clientes: tabla "clients"
- id, full_name, email, phone.

## Pistas de consulta
- Usa unaccent/ILIKE para búsquedas de texto de nombres si hace falta.
- Devuelve siempre nombres legibles (JOIN a stores/profiles/products), no solo uuids.
- Redondea importes a 2 decimales.
`.trim()
