'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { readAllPaged, readAllByIds } from '@/lib/server/paged'
import {
  createInventorySchema,
  listInventoriesSchema,
  scanInventorySchema,
  setInventoryCountSchema,
  closeInventorySchema,
  cancelInventorySchema,
  getInventorySchema,
  type CreateInventoryInput,
  type ListInventoriesInput,
  type ScanInventoryInput,
  type SetInventoryCountInput,
  type CloseInventoryInput,
} from '@/lib/validations/inventories'

/**
 * Inventarios de tienda: recuento físico contra lo que dice el sistema.
 *
 * Petición de Mónica (22-sep-2026): «Vamos a tener que hacer inventario de las
 * tiendas y no vemos dónde lo podemos hacer. Del inventario, que nos diga qué
 * es lo que había y qué es lo que hemos contado, para saber por qué está
 * fallando el stock.»
 *
 * Cómo funciona:
 *  1. Al crear el inventario se CONGELA lo que el sistema cree tener en ese
 *     almacén (`expected_quantity` por variante) junto con su coste, para poder
 *     valorar la diferencia aunque luego cambie la ficha del producto.
 *  2. Se cuenta con la pistola: cada lectura suma 1 a su línea. Lo que se
 *     escanea y no estaba previsto entra como línea "extra" con esperado 0 —
 *     que es justo el caso que hace falta detectar.
 *  3. Al cerrar se puede dejar el stock igual a lo contado. Cada ajuste deja su
 *     movimiento de tipo `inventory`, así que el historial del producto explica
 *     de dónde salió el cambio.
 *
 * Lo NO contado no se toca por defecto: contar media tienda y cerrar no puede
 * poner a cero la otra mitad.
 */

type InventoryRow = Record<string, any>

const INVENTORY_SELECT = `
  id, reference, warehouse_id, inventory_type, category_filter, season_filter, brand_filter,
  status, total_items_counted, total_differences, total_value_difference,
  total_units_expected, total_units_counted,
  started_by, completed_by, started_at, completed_at, applied_at, applied_by, notes,
  created_at, updated_at,
  warehouse:warehouses ( id, code, name, store_id, store:stores ( id, name, display_name ) ),
  started_by_profile:profiles!inventories_started_by_fkey ( id, full_name ),
  completed_by_profile:profiles!inventories_completed_by_fkey ( id, full_name )
`

const LINE_SELECT = `
  id, inventory_id, product_variant_id, expected_quantity, counted_quantity, difference,
  unit_cost, was_extra, reason, counted_by, counted_at, created_at, updated_at,
  product_variant:product_variants (
    id, variant_sku, size, color, barcode,
    product:products ( id, sku, name, brand, season, product_type, category_id, main_image_url )
  ),
  counted_by_profile:profiles!inventory_lines_counted_by_fkey ( id, full_name )
`

export const listInventories = protectedAction<
  ListInventoriesInput,
  { data: InventoryRow[]; total: number; page: number; pageSize: number }
>(
  { permission: ['stock.inventory', 'stock.view'], auditModule: 'stock' },
  async (ctx, rawInput) => {
    const input = listInventoriesSchema.parse(rawInput ?? {})

    let query = ctx.adminClient.from('inventories').select(INVENTORY_SELECT, { count: 'exact' })
    if (input.status !== 'all') query = query.eq('status', input.status)
    if (input.warehouse_id) query = query.eq('warehouse_id', input.warehouse_id)

    const from = input.page * input.pageSize
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + input.pageSize - 1)

    if (error) return failure(error.message || 'Error al listar inventarios', 'INTERNAL')
    return success({ data: data ?? [], total: count ?? 0, page: input.page, pageSize: input.pageSize })
  },
)

export const getInventory = protectedAction<{ id: string }, { inventory: InventoryRow; lines: InventoryRow[] }>(
  { permission: ['stock.inventory', 'stock.view'], auditModule: 'stock' },
  async (ctx, rawInput) => {
    const { id } = getInventorySchema.parse(rawInput)

    const { data: inventory, error } = await ctx.adminClient
      .from('inventories').select(INVENTORY_SELECT).eq('id', id).maybeSingle()
    if (error) return failure(error.message || 'Error al cargar el inventario', 'INTERNAL')
    if (!inventory) return failure('Inventario no encontrado', 'NOT_FOUND')

    // Un almacén como Pinzón pasa de 1.600 referencias: sin paginar, PostgREST
    // recorta a 1.000 y el recuento se haría sobre media tienda sin avisar.
    const lines = await readAllPaged<InventoryRow>((f, t) => ctx.adminClient
      .from('inventory_lines')
      .select(LINE_SELECT)
      .eq('inventory_id', id)
      .order('id', { ascending: true })
      .range(f, t), 'getInventory.lines')

    return success({ inventory, lines })
  },
)

export const createInventory = protectedAction<
  CreateInventoryInput,
  { id: string; reference: string; lines: number; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'stock.inventory',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'inventory',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = createInventorySchema.parse(rawInput)

    const { data: warehouse } = await ctx.adminClient
      .from('warehouses').select('id, name, code').eq('id', input.warehouse_id).maybeSingle()
    if (!warehouse) return failure('Almacén no encontrado', 'NOT_FOUND')

    // Un almacén no puede tener dos recuentos abiertos a la vez: los ajustes del
    // segundo pisarían los del primero sin que nadie lo vea.
    const { data: openOne } = await ctx.adminClient
      .from('inventories').select('id, reference')
      .eq('warehouse_id', input.warehouse_id).eq('status', 'in_progress').maybeSingle()
    if (openOne) {
      return failure(
        `Ya hay un inventario abierto en ese almacén (${openOne.reference ?? openOne.id}). Ciérralo o anúlalo antes de empezar otro.`,
        'CONFLICT',
      )
    }

    // 1) Lo que el sistema cree tener AHORA en ese almacén.
    const levels = await readAllPaged<{ product_variant_id: string; quantity: number }>((f, t) => ctx.adminClient
      .from('stock_levels')
      .select('product_variant_id, quantity')
      .eq('warehouse_id', input.warehouse_id)
      .gt('quantity', 0)
      .order('product_variant_id', { ascending: true })
      .range(f, t), 'createInventory.stock_levels')

    const expectedByVariant = new Map<string, number>()
    for (const l of levels) expectedByVariant.set(String(l.product_variant_id), Number(l.quantity) || 0)

    // 2) Ficha de cada variante, para filtrar y para congelar el coste.
    const variants = expectedByVariant.size === 0 ? [] : await readAllByIds<any>(
      [...expectedByVariant.keys()],
      (chunk) => ctx.adminClient
        .from('product_variants')
        .select('id, cost_price_override, is_active, product_id, products!inner(id, cost_price, category_id, season, brand, is_active)')
        .in('id', chunk)
        .eq('is_active', true)
        .eq('products.is_active', true),
      'createInventory.variants',
    )

    const filtered = variants.filter((v: any) => {
      const p = v.products
      if (!p) return false
      if (input.scope === 'category') return input.category_id ? p.category_id === input.category_id : true
      if (input.scope === 'season') return input.season ? p.season === input.season : true
      if (input.scope === 'brand') return input.brand ? p.brand === input.brand : true
      return true
    })

    if (filtered.length === 0) {
      return failure('No hay productos con stock en ese almacén para el filtro elegido', 'VALIDATION')
    }

    const { data: refRow, error: refError } = await ctx.adminClient.rpc('generate_inventory_reference')
    if (refError) return failure(refError.message || 'No se pudo generar la referencia del inventario', 'INTERNAL')
    const reference = String(refRow)

    const totalExpected = filtered.reduce(
      (acc: number, v: any) => acc + (expectedByVariant.get(String(v.id)) || 0),
      0,
    )

    const { data: created, error: createError } = await ctx.adminClient
      .from('inventories')
      .insert({
        reference,
        warehouse_id: input.warehouse_id,
        inventory_type: input.scope,
        category_filter: input.scope === 'category' ? input.category_id ?? null : null,
        season_filter: input.scope === 'season' ? input.season ?? null : null,
        brand_filter: input.scope === 'brand' ? input.brand ?? null : null,
        status: 'in_progress',
        total_units_expected: totalExpected,
        started_by: ctx.userId !== 'system' ? ctx.userId : null,
        started_at: new Date().toISOString(),
        notes: input.notes ?? null,
      })
      .select('id, reference')
      .single()

    if (createError || !created) return failure(createError?.message || 'No se pudo crear el inventario', 'INTERNAL')

    const rows = filtered.map((v: any) => ({
      inventory_id: created.id,
      product_variant_id: v.id,
      expected_quantity: expectedByVariant.get(String(v.id)) || 0,
      counted_quantity: null,
      unit_cost: Number(v.cost_price_override ?? v.products?.cost_price ?? 0) || 0,
      was_extra: false,
    }))

    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: linesError } = await ctx.adminClient.from('inventory_lines').insert(rows.slice(i, i + CHUNK))
      if (linesError) {
        // Sin líneas el inventario no sirve de nada: se deshace para no dejar
        // una cabecera abierta que bloquee el almacén.
        await ctx.adminClient.from('inventories').delete().eq('id', created.id)
        return failure(linesError.message || 'No se pudieron preparar las líneas del inventario', 'INTERNAL')
      }
    }

    return success({
      id: created.id,
      reference: created.reference,
      lines: rows.length,
      auditEntityId: String(created.id),
      auditDescription: `Inventario ${created.reference} en ${warehouse.name || warehouse.code} (${rows.length} referencias)`,
    })
  },
)

type ScanResult = {
  line: InventoryRow
  created: boolean
  was_extra: boolean
  product_name: string
  variant_label: string
  counted_quantity: number
  expected_quantity: number
}

const VARIANT_LOOKUP_SELECT =
  'id, variant_sku, size, color, barcode, cost_price_override, product_id, products(id, sku, name, cost_price)'

/**
 * Una lectura de pistola. El código puede ser el EAN, el SKU de la variante o el
 * SKU del producto (si solo tiene una talla). Se distingue a propósito entre
 * «ese código no está dado de alta» y «está, pero no se esperaba aquí»: es la
 * diferencia entre una etiqueta mal impresa y un descuadre de stock.
 */
export const scanInventoryCode = protectedAction<ScanInventoryInput, ScanResult>(
  { permission: 'stock.inventory', auditModule: 'stock' },
  async (ctx, rawInput) => {
    const input = scanInventorySchema.parse(rawInput)
    const code = input.code.trim()
    if (!code) return failure('Código vacío', 'VALIDATION')

    const { data: inventory } = await ctx.adminClient
      .from('inventories').select('id, status, warehouse_id').eq('id', input.inventory_id).maybeSingle()
    if (!inventory) return failure('Inventario no encontrado', 'NOT_FOUND')
    if (inventory.status !== 'in_progress') return failure('El inventario ya está cerrado', 'CONFLICT')

    // 1) Resolver la variante: EAN exacto → SKU de variante → SKU de producto.
    const { data: byBarcode } = await ctx.adminClient
      .from('product_variants').select(VARIANT_LOOKUP_SELECT).eq('barcode', code).maybeSingle()
    let variant: any = byBarcode ?? null

    if (!variant) {
      const { data: bySku } = await ctx.adminClient
        .from('product_variants').select(VARIANT_LOOKUP_SELECT).eq('variant_sku', code).maybeSingle()
      variant = bySku ?? null
    }

    if (!variant) {
      const { data: byProductSku } = await ctx.adminClient
        .from('product_variants')
        .select('id, variant_sku, size, color, barcode, cost_price_override, product_id, products!inner(id, sku, name, cost_price)')
        .eq('products.sku', code)
        .limit(2)
      if (byProductSku && byProductSku.length === 1) {
        variant = byProductSku[0]
      } else if (byProductSku && byProductSku.length > 1) {
        return failure(`El código ${code} es de un producto con varias tallas: escanea la etiqueta de la talla`, 'VALIDATION')
      }
    }

    if (!variant) {
      return failure(
        `El código ${code} no está dado de alta en ningún producto. Revisa la etiqueta o añade el EAN en Stock → Códigos de barras.`,
        'NOT_FOUND',
      )
    }

    const productName = variant.products?.name ?? 'Producto'
    const variantLabel = [variant.size ? `T.${variant.size}` : null, variant.color].filter(Boolean).join(' · ')

    // 2) Sumar sobre su línea (o crearla como "extra" si no se esperaba).
    const { data: existing } = await ctx.adminClient
      .from('inventory_lines')
      .select('id, expected_quantity, counted_quantity, was_extra')
      .eq('inventory_id', input.inventory_id)
      .eq('product_variant_id', variant.id)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    const countedBy = ctx.userId !== 'system' ? ctx.userId : null

    if (existing) {
      const counted = Number(existing.counted_quantity ?? 0) + input.quantity
      const { data: updated, error: updateError } = await ctx.adminClient
        .from('inventory_lines')
        .update({
          // `difference` NO se escribe: es una columna GENERADA
          // (counted_quantity - expected_quantity). Ver [[columnas-generadas-insert]].
          counted_quantity: counted,
          counted_by: countedBy,
          counted_at: nowIso,
        })
        .eq('id', existing.id)
        .select(LINE_SELECT)
        .single()
      if (updateError || !updated) return failure(updateError?.message || 'No se pudo apuntar la lectura', 'INTERNAL')
      return success({
        line: updated,
        created: false,
        was_extra: Boolean(existing.was_extra),
        product_name: productName,
        variant_label: variantLabel,
        counted_quantity: counted,
        expected_quantity: Number(existing.expected_quantity ?? 0),
      })
    }

    const { data: inserted, error: insertError } = await ctx.adminClient
      .from('inventory_lines')
      .insert({
        inventory_id: input.inventory_id,
        product_variant_id: variant.id,
        expected_quantity: 0,
        counted_quantity: input.quantity,
        unit_cost: Number(variant.cost_price_override ?? variant.products?.cost_price ?? 0) || 0,
        was_extra: true,
        counted_by: countedBy,
        counted_at: nowIso,
      })
      .select(LINE_SELECT)
      .single()

    if (insertError || !inserted) return failure(insertError?.message || 'No se pudo apuntar la lectura', 'INTERNAL')
    return success({
      line: inserted,
      created: true,
      was_extra: true,
      product_name: productName,
      variant_label: variantLabel,
      counted_quantity: input.quantity,
      expected_quantity: 0,
    })
  },
)

export const setInventoryCount = protectedAction<
  SetInventoryCountInput,
  { id: string; counted_quantity: number | null; difference: number | null }
>(
  { permission: 'stock.inventory', auditModule: 'stock' },
  async (ctx, rawInput) => {
    const input = setInventoryCountSchema.parse(rawInput)

    const { data: line } = await ctx.adminClient
      .from('inventory_lines')
      .select('id, expected_quantity, inventory_id, inventories(status)')
      .eq('id', input.line_id)
      .maybeSingle()
    if (!line) return failure('Línea no encontrada', 'NOT_FOUND')
    if ((line as any).inventories?.status !== 'in_progress') return failure('El inventario ya está cerrado', 'CONFLICT')

    const counted = input.counted_quantity
    const difference = counted === null ? null : counted - Number(line.expected_quantity ?? 0)
    const { error } = await ctx.adminClient
      .from('inventory_lines')
      .update({
        // `difference` es columna GENERADA: se deja que la calcule la base de datos.
        counted_quantity: counted,
        counted_by: counted === null ? null : (ctx.userId !== 'system' ? ctx.userId : null),
        counted_at: counted === null ? null : new Date().toISOString(),
      })
      .eq('id', input.line_id)

    if (error) return failure(error.message || 'No se pudo guardar el recuento', 'INTERNAL')
    return success({ id: input.line_id, counted_quantity: counted, difference })
  },
)

type CloseResult = {
  id: string
  reference: string
  counted_lines: number
  differences: number
  units_expected: number
  units_counted: number
  value_difference: number
  adjusted: number
  negative_available: number
  auditEntityId: string
  auditDescription: string
}

export const closeInventory = protectedAction<CloseInventoryInput, CloseResult>(
  {
    permission: 'stock.inventory',
    auditModule: 'stock',
    auditAction: 'state_change',
    auditEntity: 'inventory',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const input = closeInventorySchema.parse(rawInput)

    const { data: inventory } = await ctx.adminClient
      .from('inventories').select('id, reference, status, warehouse_id').eq('id', input.id).maybeSingle()
    if (!inventory) return failure('Inventario no encontrado', 'NOT_FOUND')
    if (inventory.status !== 'in_progress') return failure('El inventario ya está cerrado', 'CONFLICT')

    const lines = await readAllPaged<any>((f, t) => ctx.adminClient
      .from('inventory_lines')
      .select('id, product_variant_id, expected_quantity, counted_quantity, unit_cost')
      .eq('inventory_id', input.id)
      .order('id', { ascending: true })
      .range(f, t), 'closeInventory.lines')

    // Lo no contado: o se deja como estaba, o se da por contado a 0.
    const effective = lines.map((l) => {
      const expected = Number(l.expected_quantity ?? 0)
      const raw = l.counted_quantity
      const counted = raw === null || raw === undefined
        ? (input.uncounted === 'zero' ? 0 : null)
        : Number(raw)
      return { id: l.id as string, product_variant_id: l.product_variant_id as string, unit_cost: Number(l.unit_cost ?? 0), rawCounted: raw, expected, counted }
    })

    const withCount = effective.filter((l) => l.counted !== null) as Array<Omit<typeof effective[number], 'counted'> & { counted: number }>
    const diffs = withCount.filter((l) => l.counted !== l.expected)
    const unitsExpected = effective.reduce((acc, l) => acc + l.expected, 0)
    const unitsCounted = withCount.reduce((acc, l) => acc + l.counted, 0)
    const valueDifference = diffs.reduce((acc, l) => acc + (l.counted - l.expected) * (l.unit_cost || 0), 0)

    // Guardar la diferencia también en las líneas que entran por "uncounted=zero",
    // para que el informe cuadre con lo que se acaba de decidir.
    if (input.uncounted === 'zero') {
      const toZero = effective.filter((l) => l.rawCounted === null || l.rawCounted === undefined)
      const CHUNK = 100
      for (let i = 0; i < toZero.length; i += CHUNK) {
        await Promise.all(toZero.slice(i, i + CHUNK).map((l) => ctx.adminClient
          .from('inventory_lines')
          .update({ counted_quantity: 0 })
          .eq('id', l.id)))
      }
    }

    let adjusted = 0
    let negativeAvailable = 0

    if (input.apply_adjustments && diffs.length > 0) {
      for (const l of diffs) {
        const { data: level } = await ctx.adminClient
          .from('stock_levels')
          .select('id, quantity, reserved')
          .eq('product_variant_id', l.product_variant_id)
          .eq('warehouse_id', inventory.warehouse_id)
          .maybeSingle()

        const before = Number(level?.quantity ?? 0)
        const after = l.counted
        const delta = after - before
        if (delta === 0) continue

        if (level?.id) {
          const { error: updError } = await ctx.adminClient
            .from('stock_levels')
            .update({ quantity: after, last_movement_at: new Date().toISOString() })
            .eq('id', level.id)
          if (updError) return failure(updError.message || 'No se pudo ajustar el stock', 'INTERNAL')
          // Contado por debajo de lo reservado: el disponible queda en negativo
          // y hay una reserva que ya no se puede servir. Se cuenta para avisar.
          if (after < Number(level.reserved ?? 0)) negativeAvailable++
        } else {
          const { error: insError } = await ctx.adminClient
            .from('stock_levels')
            .insert({
              product_variant_id: l.product_variant_id,
              warehouse_id: inventory.warehouse_id,
              quantity: after,
              reserved: 0,
            })
          if (insError) return failure(insError.message || 'No se pudo crear el stock ajustado', 'INTERNAL')
        }

        const { error: movError } = await ctx.adminClient.from('stock_movements').insert({
          product_variant_id: l.product_variant_id,
          warehouse_id: inventory.warehouse_id,
          movement_type: 'inventory',
          quantity: delta,
          stock_before: before,
          stock_after: after,
          reference_type: 'inventory',
          reference_id: inventory.id,
          reason: `Inventario ${inventory.reference}: contadas ${after} uds (sistema ${before})`,
          created_by: ctx.userId !== 'system' ? ctx.userId : null,
        })
        if (movError) return failure(movError.message || 'No se pudo registrar el movimiento de inventario', 'INTERNAL')

        adjusted++
      }
    }

    const nowIso = new Date().toISOString()
    const { error: closeError } = await ctx.adminClient
      .from('inventories')
      .update({
        status: 'completed',
        total_items_counted: withCount.length,
        total_differences: diffs.length,
        total_value_difference: Number(valueDifference.toFixed(2)),
        total_units_expected: unitsExpected,
        total_units_counted: unitsCounted,
        completed_by: ctx.userId !== 'system' ? ctx.userId : null,
        completed_at: nowIso,
        applied_at: input.apply_adjustments ? nowIso : null,
        applied_by: input.apply_adjustments ? (ctx.userId !== 'system' ? ctx.userId : null) : null,
      })
      .eq('id', input.id)

    if (closeError) return failure(closeError.message || 'No se pudo cerrar el inventario', 'INTERNAL')

    return success({
      id: input.id,
      reference: inventory.reference,
      counted_lines: withCount.length,
      differences: diffs.length,
      units_expected: unitsExpected,
      units_counted: unitsCounted,
      value_difference: Number(valueDifference.toFixed(2)),
      adjusted,
      negative_available: negativeAvailable,
      auditEntityId: String(input.id),
      auditDescription: input.apply_adjustments
        ? `Inventario ${inventory.reference} cerrado y stock ajustado (${adjusted} referencias)`
        : `Inventario ${inventory.reference} cerrado sin ajustar stock (${diffs.length} diferencias)`,
    })
  },
)

export const cancelInventory = protectedAction<{ id: string }, { id: string; auditEntityId: string; auditDescription: string }>(
  {
    permission: 'stock.inventory',
    auditModule: 'stock',
    auditAction: 'state_change',
    auditEntity: 'inventory',
    revalidate: ['/admin/stock'],
  },
  async (ctx, rawInput) => {
    const { id } = cancelInventorySchema.parse(rawInput)
    const { data: inventory } = await ctx.adminClient
      .from('inventories').select('id, reference, status').eq('id', id).maybeSingle()
    if (!inventory) return failure('Inventario no encontrado', 'NOT_FOUND')
    if (inventory.status !== 'in_progress') return failure('Solo se puede anular un inventario en curso', 'CONFLICT')

    const { error } = await ctx.adminClient
      .from('inventories')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        completed_by: ctx.userId !== 'system' ? ctx.userId : null,
      })
      .eq('id', id)
    if (error) return failure(error.message || 'No se pudo anular el inventario', 'INTERNAL')

    return success({
      id,
      auditEntityId: String(id),
      auditDescription: `Inventario ${inventory.reference} anulado`,
    })
  },
)
