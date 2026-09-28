import type { AdminClient } from '@/lib/server/action-wrapper'
import { BOUTIQUE_SALE_TYPE } from '@/lib/reports/dimensions'
import { isPedidoCobroDescription } from '@/lib/accounting/pedido-cobro-lines'
import { readAllPaged } from '@/lib/server/paged'

// ─── Informe de Productos: unidades por TIPOLOGÍA y por COLOR (sep-2026) ─────
// Petición de la tienda: "10 pantalones, 16 camisas y 2 pares de zapatos" y
// "16 productos azules, 2 rosas y 39 blancos" en un periodo.
//
//  - Tipología = categoría del producto (product_categories), agrupada por su
//    categoría madre (Camisas y Poleras → Camisas, Poleras, Sobrecamisas…).
//  - Color = products.color_code, del catálogo de la tienda (mig 294); la familia
//    es la centena (300 = Azules).
//
// Unidades NETAS de devoluciones (quantity − quantity_returned), por eso entran
// también los tickets devueltos parcial o totalmente. Solo género de boutique: no
// cuentan tarjetas regalo, cobros de pedido de sastrería ni líneas sin producto
// (arreglos, textos sueltos). La tienda online suma aparte y solo en "Todas" (no
// tiene tienda física).

const DEFAULT_TAX_RATE = 21
const round2 = (n: number) => Math.round(n * 100) / 100

export type ProductMixRow = { key: string; name: string; units: number; units_store: number; units_online: number; revenue_net: number }
export type ProductMixCategoryGroup = ProductMixRow & { children: ProductMixRow[] }
export type ProductMixColorGroup = ProductMixRow & { colors: (ProductMixRow & { code: number | null; hex: string | null })[] }

export type ProductMixReport = {
  total: { units: number; units_store: number; units_online: number; revenue_net: number }
  byCategory: ProductMixCategoryGroup[]
  byColor: ProductMixColorGroup[]
  /** Productos activos del catálogo con color asignado: sin esto el informe por color no es fiable. */
  colorCoverage: { with_color: number; total: number }
}

type Sold = { productId: string; units: number; revenueNet: number; channel: 'store' | 'online' }

export async function computeBoutiqueProductMix(
  adminClient: AdminClient,
  { start_date, end_date, store_id }: { start_date: string; end_date: string; store_id?: string },
): Promise<ProductMixReport> {
  // readAllPaged pide una consulta NUEVA por página: por eso son constructores.
  const buildSales = () => {
    let q = adminClient
      .from('sale_lines')
      .select('description, quantity, quantity_returned, line_total, tax_rate, product_variants!inner(product_id), sales!inner(status, sale_type, store_id, created_at)')
      .in('sales.status', ['completed', 'partially_returned', 'fully_returned'])
      .eq('sales.sale_type', BOUTIQUE_SALE_TYPE)
      .is('tailoring_order_id', null)
      .gte('sales.created_at', `${start_date}T00:00:00`)
      .lte('sales.created_at', `${end_date}T23:59:59`)
    if (store_id) q = q.eq('sales.store_id', store_id)
    return q
  }

  const buildOnline = () => adminClient
    .from('online_order_lines')
    .select('quantity, total, status, product_variants!online_order_lines_variant_id_fkey!inner(product_id), online_orders!inner(status, created_at)')
    .neq('online_orders.status', 'cancelled')
    .gte('online_orders.created_at', `${start_date}T00:00:00`)
    .lte('online_orders.created_at', `${end_date}T23:59:59`)

  const [saleLines, onlineLines, productsRaw, categoriesRes, colorsRes] = await Promise.all([
    readAllPaged<any>((f, t) => buildSales().order('id', { ascending: true }).range(f, t), 'getBoutiqueProductMix.saleLines'),
    store_id
      ? Promise.resolve([] as any[])
      : readAllPaged<any>((f, t) => buildOnline().order('id', { ascending: true }).range(f, t), 'getBoutiqueProductMix.onlineLines'),
    readAllPaged<any>((f, t) => adminClient
      .from('products')
      .select('id, category_id, color_code, is_active')
      .order('id', { ascending: true })
      .range(f, t), 'getBoutiqueProductMix.products'),
    adminClient.from('product_categories').select('id, name, parent_id'),
    adminClient.from('product_colors').select('code, name, family, hex'),
  ])

  const sold: Sold[] = []
  for (const l of saleLines) {
    const desc = String(l.description || '')
    if (desc.startsWith('Cobro pendiente') || isPedidoCobroDescription(desc)) continue
    const v = Array.isArray(l.product_variants) ? l.product_variants[0] : l.product_variants
    if (!v?.product_id) continue
    const qty = Number(l.quantity ?? 0)
    const units = qty - Number(l.quantity_returned ?? 0)
    if (units <= 0 || qty <= 0) continue
    const net = Number(l.line_total ?? 0) / (1 + Number(l.tax_rate ?? DEFAULT_TAX_RATE) / 100)
    sold.push({ productId: String(v.product_id), units, revenueNet: net * (units / qty), channel: 'store' })
  }
  for (const l of onlineLines) {
    if (l.status === 'cancelled') continue
    const v = Array.isArray(l.product_variants) ? l.product_variants[0] : l.product_variants
    if (!v?.product_id) continue
    const units = Number(l.quantity ?? 0)
    if (units <= 0) continue
    // La web vende con IVA general incluido (21 % hasta OSS).
    sold.push({ productId: String(v.product_id), units, revenueNet: Number(l.total ?? 0) / 1.21, channel: 'online' })
  }

  const productById = new Map<string, { category_id: string | null; color_code: number | null }>()
  let activeTotal = 0
  let activeWithColor = 0
  for (const p of productsRaw) {
    productById.set(String(p.id), { category_id: p.category_id ?? null, color_code: p.color_code != null ? Number(p.color_code) : null })
    if (p.is_active) {
      activeTotal++
      if (p.color_code != null) activeWithColor++
    }
  }

  const categories = new Map<string, { name: string; parent_id: string | null }>()
  for (const c of (categoriesRes.data ?? []) as { id: string; name: string; parent_id: string | null }[]) {
    categories.set(String(c.id), { name: String(c.name ?? ''), parent_id: c.parent_id ?? null })
  }
  // Categoría madre de primer nivel (sube por parent_id; tope de 5 por si hay un ciclo).
  const rootOf = (id: string | null): string | null => {
    let cur = id
    for (let i = 0; cur && i < 5; i++) {
      const parent = categories.get(cur)?.parent_id ?? null
      if (!parent) return cur
      cur = parent
    }
    return cur
  }

  const colors = new Map<number, { name: string; family: string; hex: string | null }>()
  for (const c of (colorsRes.data ?? []) as { code: number; name: string; family: string; hex: string | null }[]) {
    colors.set(Number(c.code), { name: String(c.name ?? ''), family: String(c.family ?? ''), hex: c.hex ?? null })
  }

  const emptyRow = (key: string, name: string): ProductMixRow => ({ key, name, units: 0, units_store: 0, units_online: 0, revenue_net: 0 })
  const add = (row: ProductMixRow, s: Sold) => {
    row.units += s.units
    if (s.channel === 'store') row.units_store += s.units
    else row.units_online += s.units
    row.revenue_net += s.revenueNet
  }

  const total = emptyRow('total', 'Total')
  const catGroups = new Map<string, ProductMixCategoryGroup>()
  const catChildren = new Map<string, Map<string, ProductMixRow>>()
  const colorGroups = new Map<string, ProductMixColorGroup>()
  const colorChildren = new Map<string, Map<string, ProductMixRow & { code: number | null; hex: string | null }>>()

  for (const s of sold) {
    add(total, s)
    const p = productById.get(s.productId)

    // Tipología
    const catId = p?.category_id ?? null
    const rootId = rootOf(catId)
    const rootKey = rootId ?? 'none'
    const group = catGroups.get(rootKey) ?? { ...emptyRow(rootKey, rootId ? (categories.get(rootId)?.name ?? 'Categoría borrada') : 'Sin categoría'), children: [] }
    catGroups.set(rootKey, group)
    add(group, s)
    const childKey = catId ?? 'none'
    const children = catChildren.get(rootKey) ?? new Map<string, ProductMixRow>()
    catChildren.set(rootKey, children)
    const child = children.get(childKey) ?? emptyRow(childKey, catId ? (categories.get(catId)?.name ?? 'Categoría borrada') : 'Sin categoría')
    children.set(childKey, child)
    add(child, s)

    // Color
    const code = p?.color_code ?? null
    const color = code != null ? colors.get(code) : undefined
    const familyKey = color ? color.family : 'none'
    const fam = colorGroups.get(familyKey) ?? { ...emptyRow(familyKey, color ? color.family : 'Sin color asignado'), colors: [] }
    colorGroups.set(familyKey, fam)
    add(fam, s)
    const famColors = colorChildren.get(familyKey) ?? new Map()
    colorChildren.set(familyKey, famColors)
    const colorKey = code != null ? String(code) : 'none'
    const cRow = famColors.get(colorKey) ?? { ...emptyRow(colorKey, color ? color.name : 'Sin color asignado'), code, hex: color?.hex ?? null }
    famColors.set(colorKey, cRow)
    add(cRow, s)
  }

  const finish = <T extends ProductMixRow>(r: T): T => ({ ...r, revenue_net: round2(r.revenue_net) })
  // "Sin categoría" / "Sin color" siempre al final; el resto por unidades.
  const byUnits = (a: ProductMixRow, b: ProductMixRow) =>
    (a.key === 'none' ? 1 : 0) - (b.key === 'none' ? 1 : 0) || b.units - a.units || a.name.localeCompare(b.name)

  const byCategory = [...catGroups.values()].map((g) => finish({
    ...g,
    children: [...(catChildren.get(g.key)?.values() ?? [])].map(finish).sort(byUnits),
  })).sort(byUnits)

  // Familias en el orden del catálogo (100, 200…) y colores por código: así el
  // informe se lee igual que la carta de colores de la tienda.
  const familyOrder = new Map<string, number>()
  for (const [code, c] of colors) if (!familyOrder.has(c.family) || code < familyOrder.get(c.family)!) familyOrder.set(c.family, code)
  const byColor = [...colorGroups.values()].map((g) => finish({
    ...g,
    colors: [...(colorChildren.get(g.key)?.values() ?? [])].map(finish).sort((a, b) => (a.code ?? 9999) - (b.code ?? 9999)),
  })).sort((a, b) => (familyOrder.get(a.key) ?? 9999) - (familyOrder.get(b.key) ?? 9999))

  return ({
    total: { units: total.units, units_store: total.units_store, units_online: total.units_online, revenue_net: round2(total.revenue_net) },
    byCategory,
    byColor,
    colorCoverage: { with_color: activeWithColor, total: activeTotal },
  })
}
