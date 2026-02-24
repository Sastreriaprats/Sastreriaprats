/**
 * Tipos de proveedores, tejidos, pedidos a proveedor, facturas y pagos.
 * Tipos de tablas re-exportados desde el schema Drizzle.
 */

export type {
  Supplier,
  NewSupplier,
  SupplierContact,
  NewSupplierContact,
  FabricCategory,
  NewFabricCategory,
  Fabric,
  NewFabric,
  SupplierOrder,
  NewSupplierOrder,
  SupplierOrderLine,
  NewSupplierOrderLine,
  SupplierInvoice,
  NewSupplierInvoice,
  SupplierPayment,
  NewSupplierPayment,
  SupplierDueDate,
  NewSupplierDueDate,
} from '@/lib/db/schema'

/** Vista: resumen de proveedor con próximo vencimiento y pedidos activos */
export interface SupplierSummary {
  id: string
  supplier_code: string | null
  name: string
  supplier_types: string[] | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  payment_terms: string | null
  total_debt: string | null
  is_active: boolean
  next_due_date: string | null
  active_orders: number
  created_at: Date
}

/** Vista: tejidos con stock, proveedor, categoría y alerta de stock bajo */
export interface FabricStock {
  id: string
  fabric_code: string | null
  name: string
  color_name: string | null
  pattern: string | null
  composition: string | null
  price_per_meter: string | null
  stock_meters: string | null
  reserved_meters: string | null
  available_meters: string | null
  min_stock_meters: string | null
  status: string | null
  season: string | null
  is_permanent: boolean | null
  supplier_name: string | null
  supplier_id: string | null
  category_name: string | null
  warehouse_name: string | null
  low_stock_alert: boolean
}
