/**
 * Tipos de productos, variantes, stock, traspasos e inventarios.
 */

export type {
  ProductCategory,
  NewProductCategory,
  Product,
  NewProduct,
  ProductVariant,
  NewProductVariant,
  StockLevel,
  NewStockLevel,
  StockMovement,
  NewStockMovement,
  StockTransfer,
  NewStockTransfer,
  StockTransferLine,
  NewStockTransferLine,
  Inventory,
  NewInventory,
  InventoryLine,
  NewInventoryLine,
} from '@/lib/db/schema'

/** Vista: productos con stock total agregado */
export interface ProductWithStock {
  id: string
  sku: string
  name: string
  product_type: string
  brand: string | null
  base_price: string | null
  price_with_tax: string | null
  cost_price: string | null
  main_image_url: string | null
  is_visible_web: boolean | null
  is_active: boolean
  category_name: string | null
  category_slug: string | null
  supplier_name: string | null
  total_stock: number
  total_available: number
  variant_count: number
  store_count: number
}
