import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkUserPermission } from '@/actions/auth'

/**
 * Exporta el inventario completo a CSV: una fila por (variante × almacén con stock).
 * Incluye: producto, talla, color, proveedor, almacén, tienda, stock, precios.
 * Pensado para hacer inventarios físicos por tienda/talla/proveedor.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasPerm = await checkUserPermission(user.id, 'products.view')
  if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const [warehousesRes, categoriesRes, suppliersRes] = await Promise.all([
    admin.from('warehouses').select('id, name, code, store_id, stores(name)'),
    admin.from('product_categories').select('id, name'),
    admin.from('suppliers').select('id, name'),
  ])

  const warehousesById = new Map<string, { name: string; code: string; storeName: string }>()
  for (const w of warehousesRes.data ?? []) {
    const storeName = Array.isArray((w as any).stores) ? (w as any).stores[0]?.name : (w as any).stores?.name
    warehousesById.set((w as any).id, {
      name: (w as any).name ?? '',
      code: (w as any).code ?? '',
      storeName: storeName ?? '',
    })
  }
  const categoriesById = new Map<string, string>()
  for (const c of categoriesRes.data ?? []) categoriesById.set((c as any).id, (c as any).name)
  const suppliersById = new Map<string, string>()
  for (const s of suppliersRes.data ?? []) suppliersById.set((s as any).id, (s as any).name)

  // Traer productos activos en páginas para evitar límite de Supabase (1000 filas)
  type ProductRow = {
    id: string; sku: string; name: string; product_type: string | null;
    category_id: string | null; brand: string | null; collection: string | null; season: string | null;
    cost_price: number | string | null; base_price: number | string | null; price_with_tax: number | string | null;
    tax_rate: number | string | null; supplier_id: string | null; supplier_reference: string | null;
  }
  const products: ProductRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('products')
      .select('id, sku, name, product_type, category_id, brand, collection, season, cost_price, base_price, price_with_tax, tax_rate, supplier_id, supplier_reference')
      .eq('is_active', true)
      .order('sku', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    products.push(...(data as ProductRow[]))
    if (data.length < PAGE) break
  }

  if (products.length === 0) {
    return csvResponse(['Sin productos'], 'inventario-vacio')
  }

  const productIds = products.map(p => p.id)
  const productsById = new Map<string, ProductRow>()
  for (const p of products) productsById.set(p.id, p)

  // Variantes (paginadas también)
  type VariantRow = {
    id: string; product_id: string; size: string | null; color: string | null;
    variant_sku: string; barcode: string | null;
    price_override: number | string | null; cost_price_override: number | string | null;
    is_active: boolean;
  }
  const variants: VariantRow[] = []
  for (let i = 0; i < productIds.length; i += 200) {
    const chunk = productIds.slice(i, i + 200)
    const { data, error } = await admin
      .from('product_variants')
      .select('id, product_id, size, color, variant_sku, barcode, price_override, cost_price_override, is_active')
      .in('product_id', chunk)
      .eq('is_active', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    variants.push(...((data ?? []) as VariantRow[]))
  }
  const variantsById = new Map<string, VariantRow>()
  for (const v of variants) variantsById.set(v.id, v)
  const variantIds = variants.map(v => v.id)

  // Niveles de stock
  type StockRow = {
    product_variant_id: string; warehouse_id: string;
    quantity: number | null; reserved: number | null; min_stock: number | null;
  }
  const stockRows: StockRow[] = []
  for (let i = 0; i < variantIds.length; i += 200) {
    const chunk = variantIds.slice(i, i + 200)
    const { data, error } = await admin
      .from('stock_levels')
      .select('product_variant_id, warehouse_id, quantity, reserved, min_stock')
      .in('product_variant_id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    stockRows.push(...((data ?? []) as StockRow[]))
  }

  const header = [
    'SKU producto', 'SKU variante', 'Código barras', 'Producto',
    'Tipo', 'Categoría', 'Marca', 'Colección', 'Temporada',
    'Talla', 'Color', 'Proveedor', 'Ref. proveedor',
    'PVP (c/IVA)', 'Coste', 'IVA %',
    'Tienda', 'Almacén', 'Código almacén',
    'Stock', 'Reservado', 'Stock mín.',
  ]

  const lines: string[] = [header.map(csvEscape).join(',')]

  for (const sr of stockRows) {
    const v = variantsById.get(sr.product_variant_id)
    if (!v) continue
    const p = productsById.get(v.product_id)
    if (!p) continue
    const w = warehousesById.get(sr.warehouse_id)
    const pvp = v.price_override != null ? Number(v.price_override) : (p.price_with_tax != null ? Number(p.price_with_tax) : Number(p.base_price ?? 0))
    const coste = v.cost_price_override != null ? Number(v.cost_price_override) : (p.cost_price != null ? Number(p.cost_price) : null)

    const row = [
      p.sku, v.variant_sku, v.barcode ?? '', p.name,
      p.product_type ?? '',
      p.category_id ? (categoriesById.get(p.category_id) ?? '') : '',
      p.brand ?? '', p.collection ?? '', p.season ?? '',
      v.size ?? '', v.color ?? (p as any).color ?? '',
      p.supplier_id ? (suppliersById.get(p.supplier_id) ?? '') : '',
      p.supplier_reference ?? '',
      formatNum(pvp), coste != null ? formatNum(coste) : '', p.tax_rate != null ? String(p.tax_rate) : '',
      w?.storeName ?? '', w?.name ?? '', w?.code ?? '',
      sr.quantity ?? 0, sr.reserved ?? 0, sr.min_stock ?? '',
    ]
    lines.push(row.map(csvEscape).join(','))
  }

  const today = new Date().toISOString().slice(0, 10)
  return csvResponse(lines, `inventario-prats-${today}`)
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function formatNum(n: number): string {
  if (Number.isNaN(n)) return ''
  return n.toFixed(2).replace('.', ',')
}

function csvResponse(lines: string[], filename: string) {
  const csv = '\uFEFF' + lines.join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  })
}
