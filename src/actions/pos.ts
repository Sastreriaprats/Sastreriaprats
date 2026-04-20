'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import {
  openCashSessionSchema, closeCashSessionSchema,
  createSaleSchema,
} from '@/lib/validations/pos'
import { success, failure } from '@/lib/errors'
import { createSaleJournalEntry } from '@/actions/accounting-triggers'

/** Lista de empleados que pueden realizar ventas en la tienda (usuarios asignados a la tienda). */
export const listPosEmployees = protectedAction<
  { store_id: string },
  { id: string; full_name: string }[]
>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { store_id }) => {
    if (!store_id) return success([])
    const { data: rows, error } = await ctx.adminClient
      .from('user_stores')
      .select('user_id, profiles!user_stores_user_id_fkey(id, full_name)')
      .eq('store_id', store_id)
    if (error) return failure(error.message)
    const list: { id: string; full_name: string }[] = []
    const seen = new Set<string>()
    for (const r of rows ?? []) {
      const profile = (r as any).profiles
      const id = profile?.id ?? (r as any).user_id
      if (id && !seen.has(id)) {
        seen.add(id)
        list.push({ id, full_name: profile?.full_name ?? 'Sin nombre' })
      }
    }
    list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    return success(list)
  },
)

export const openCashSession = protectedAction<any, any>(
  {
    permission: 'pos.open_session',
    auditModule: 'pos',
    auditAction: 'create',
    auditEntity: 'cash_session',
    revalidate: ['/pos'],
  },
  async (ctx, input) => {
    const parsed = openCashSessionSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message)

    const { data: existing } = await ctx.adminClient
      .from('cash_sessions')
      .select('id')
      .eq('store_id', parsed.data.store_id)
      .eq('status', 'open')
      .single()

    if (existing) return failure('Ya hay una caja abierta en esta tienda. Ciérrala primero.')

    const { data: session, error } = await ctx.adminClient
      .from('cash_sessions')
      .insert({
        store_id: parsed.data.store_id,
        opened_by: ctx.userId,
        opening_amount: parsed.data.opening_amount,
        opening_breakdown: parsed.data.opening_breakdown ?? null,
        status: 'open',
      })
      .select()
      .single()

    if (error) return failure(error.message)
    await ctx.adminClient.from('manual_transactions').insert({
      type: 'income',
      date: new Date().toISOString().split('T')[0],
      description: 'Apertura de caja',
      category: 'caja',
      amount: parsed.data.opening_amount,
      tax_rate: 0,
      tax_amount: 0,
      total: parsed.data.opening_amount,
      created_by: ctx.userId,
      cash_session_id: session.id,
    })
    const description = `Apertura de caja — Fondo inicial: ${Number(parsed.data.opening_amount).toFixed(2)} €`
    return success({ ...session, auditDescription: description })
  }
)

export const closeCashSession = protectedAction<any, any>(
  {
    permission: 'pos.close_session',
    auditModule: 'pos',
    auditAction: 'update',
    auditEntity: 'cash_session',
    revalidate: ['/pos'],
  },
  async (ctx, input) => {
    const parsed = closeCashSessionSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message)

    const { data: session } = await ctx.adminClient
      .from('cash_sessions')
      .select('*')
      .eq('id', parsed.data.session_id)
      .eq('status', 'open')
      .single()

    if (!session) return failure('Sesión de caja no encontrada o ya cerrada')

    const expectedCash = (session.opening_amount || 0)
      + (session.total_cash_sales || 0)
      - (session.total_returns || 0)
      - (session.total_withdrawals || 0)

    const difference = parsed.data.counted_cash - expectedCash

    if (Math.abs(difference) >= 0.01) {
      return failure('No se puede cerrar la caja con un descuadre. El efectivo contado debe coincidir con el esperado.')
    }

    const { data: closed, error } = await ctx.adminClient
      .from('cash_sessions')
      .update({
        closed_by: ctx.userId,
        closed_at: new Date().toISOString(),
        counted_cash: parsed.data.counted_cash,
        expected_cash: expectedCash,
        cash_difference: difference,
        closing_notes: parsed.data.closing_notes || null,
        closing_breakdown: parsed.data.closing_breakdown ?? null,
        status: 'closed',
      })
      .eq('id', session.id)
      .select()
      .single()

    if (error) return failure(error.message)
    const description = `Cierre de caja — Efectivo contado: ${Number(parsed.data.counted_cash).toFixed(2)} €`
    return success({ ...closed, auditDescription: description })
  }
)

export const getCurrentSession = protectedAction<string, any>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, storeId) => {
    const { data: session } = await ctx.adminClient
      .from('cash_sessions')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'open')
      .single()

    return success(session)
  }
)

/** Lista de todas las tiendas físicas (con caja) para el selector de caja. No depende de la asignación del usuario. */
export const getPhysicalStoresForCaja = protectedAction<void, Array<{ storeId: string; storeName: string }>>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx) => {
    const { data: stores } = await ctx.adminClient
      .from('stores')
      .select('id, name')
      .eq('is_active', true)
      .eq('store_type', 'physical')
      .order('name')
    const list = (stores ?? []).map((s: { id: string; name: string }) => ({ storeId: s.id, storeName: s.name || s.id }))
    return success(list)
  }
)

export const createSale = protectedAction<{
  sale: any; lines: any[]; payments: any[]
}, any>(
  {
    permission: 'pos.sell',
    auditModule: 'pos',
    auditAction: 'create',
    auditEntity: 'sale',
    revalidate: ['/pos'],
  },
  async (ctx, { sale: saleInput, lines: linesInput, payments: paymentsInput }) => {
    const parsedSale = createSaleSchema.safeParse(saleInput)
    if (!parsedSale.success) return failure(parsedSale.error.issues[0].message)

    // Verificar que hay una caja abierta
    const sessionId = (parsedSale.data as any).cash_session_id
    if (!sessionId) return failure('No hay una caja abierta. Abre la caja antes de registrar una venta.')
    const { data: openSession } = await ctx.adminClient
      .from('cash_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('status', 'open')
      .single()
    if (!openSession) return failure('La sesión de caja está cerrada. Abre la caja antes de registrar una venta.')

    const { data: result, error: rpcError } = await ctx.adminClient.rpc('rpc_create_sale', {
      p_sale: parsedSale.data,
      p_lines: linesInput,
      p_payments: paymentsInput,
      p_user_id: ctx.userId,
    })

    if (rpcError) return failure(rpcError.message)

    // Fire-and-forget: asiento contable
    createSaleJournalEntry(result.id).catch(() => {})

    const auditDescription = `Venta #${result.ticket_number} · Cliente: ${result.client_name} · Total: ${Number(result.total).toFixed(2)}€`

    return success({
      ...result,
      auditDescription,
    })
  }
)

/** Datos de una venta para generar ticket PDF (admin o ficha cliente). */
export const getSaleForTicket = protectedAction<string, {
  sale: any
  lines: any[]
  payments: any[]
  clientName: string | null
  clientCode: string | null
  storeName: string | null
} | null>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, saleId) => {
    const { data: sale, error } = await ctx.adminClient
      .from('sales')
      .select(`
        id, ticket_number, created_at, client_id, subtotal, discount_amount, discount_percentage,
        tax_amount, total, payment_method, is_tax_free, status,
        stores(name)
      `)
      .eq('id', saleId)
      .single()
    if (error || !sale) return success(null)

    const { data: lines } = await ctx.adminClient
      .from('sale_lines')
      .select('description, quantity, unit_price, discount_percentage, line_total')
      .eq('sale_id', saleId)
    const { data: payments } = await ctx.adminClient
      .from('sale_payments')
      .select('payment_method, amount')
      .eq('sale_id', saleId)

    let clientName: string | null = null
    let clientCode: string | null = null
    if (sale.client_id) {
      const { data: client } = await ctx.adminClient
        .from('clients')
        .select('full_name, client_code')
        .eq('id', sale.client_id)
        .single()
      if (client) {
        clientName = client.full_name ?? null
        clientCode = client.client_code ?? null
      }
    }

    const storeName = (sale.stores as { name?: string } | null)?.name ?? null

    return success({
      sale,
      lines: lines ?? [],
      payments: payments ?? [],
      clientName,
      clientCode,
      storeName,
    })
  }
)

export const listTickets = protectedAction<{
  page?: number
  pageSize?: number
  clientSearch?: string
  dateFrom?: string
  dateTo?: string
  productSearch?: string
}, { data: any[]; total: number; page: number; pageSize: number; totalPages: number }>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { page = 1, pageSize = 20, clientSearch, dateFrom, dateTo, productSearch }) => {
    let query = ctx.adminClient
      .from('sales')
      .select('id, ticket_number, created_at, total, payment_method, status, client_id, stores(name), profiles!sales_salesperson_id_fkey(full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00')
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')

    let saleIds: string[] | null = null
    if (clientSearch && clientSearch.trim()) {
      const q = clientSearch.trim()
      const { data: clients } = await ctx.adminClient
        .from('clients')
        .select('id')
        .or(`full_name.ilike.%${q}%,client_code.ilike.%${q}%`)
        .limit(500)
      const ids = (clients ?? []).map((c: any) => c.id)
      if (ids.length === 0) return success({ data: [], total: 0, page, pageSize, totalPages: 0 })
      query = query.in('client_id', ids)
    }

    if (productSearch && productSearch.trim()) {
      const { data: lines } = await ctx.adminClient
        .from('sale_lines')
        .select('sale_id')
        .ilike('description', '%' + productSearch.trim() + '%')
        .limit(1000)
      const ids = [...new Set((lines ?? []).map((l: any) => l.sale_id))]
      if (ids.length === 0) return success({ data: [], total: 0, page, pageSize, totalPages: 0 })
      query = query.in('id', ids)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const { data: sales, count, error } = await query.range(from, to)

    if (error) return failure(error.message)

    const total = count ?? 0
    const list = (sales ?? []) as any[]

    if (list.length === 0) return success({ data: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) })

    const clientIds = [...new Set(list.map((s: any) => s.client_id).filter(Boolean))]
    const saleIdsForLines = list.map((s: any) => s.id)

    const [clientsResult, linesResult] = await Promise.all([
      clientIds.length > 0
        ? ctx.adminClient.from('clients').select('id, full_name, client_code').in('id', clientIds)
        : Promise.resolve({ data: [] as any[] }),
      ctx.adminClient.from('sale_lines').select('sale_id, description').in('sale_id', saleIdsForLines),
    ])

    let clientsMap: Record<string, { full_name: string; client_code: string }> = {}
    for (const c of clientsResult.data ?? []) {
      clientsMap[c.id] = { full_name: c.full_name ?? '', client_code: c.client_code ?? '' }
    }

    const allLines = linesResult.data
    const linesBySale: Record<string, string[]> = {}
    for (const l of allLines ?? []) {
      if (!linesBySale[l.sale_id]) linesBySale[l.sale_id] = []
      linesBySale[l.sale_id].push(l.description)
    }

    const data = list.map((s: any) => ({
      id: s.id,
      ticket_number: s.ticket_number,
      created_at: s.created_at,
      total: s.total,
      payment_method: s.payment_method,
      status: s.status,
      store_name: (s.stores as any)?.name,
      client_name: s.client_id ? (clientsMap[s.client_id]?.full_name ?? '') : null,
      client_code: s.client_id ? (clientsMap[s.client_id]?.client_code ?? '') : null,
      products_summary: (linesBySale[s.id] ?? []).slice(0, 3).join(' · ') || '—',
      salesperson_name: (s.profiles as any)?.full_name ?? null,
    }))

    return success({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  }
)

export const cashWithdrawal = protectedAction<{
  session_id: string; amount: number; reason: string
}, any>(
  {
    permission: 'pos.sell',
    auditModule: 'pos',
    auditAction: 'create',
    auditEntity: 'cash_withdrawal',
    revalidate: ['/pos'],
  },
  async (ctx, input) => {
    const { data: withdrawal, error } = await ctx.adminClient
      .from('cash_withdrawals')
      .insert({
        cash_session_id: input.session_id,
        amount: input.amount,
        reason: input.reason,
        withdrawn_by: ctx.userId,
      })
      .select()
      .single()

    if (error) return failure(error.message)

    const { data: session } = await ctx.adminClient
      .from('cash_sessions')
      .select('total_withdrawals')
      .eq('id', input.session_id)
      .single()

    if (session) {
      await ctx.adminClient
        .from('cash_sessions')
        .update({ total_withdrawals: (session.total_withdrawals || 0) + input.amount })
        .eq('id', input.session_id)
    }

    await ctx.adminClient.from('manual_transactions').insert({
      type: 'expense',
      date: new Date().toISOString().split('T')[0],
      description: `Retirada de caja: ${input.reason}`,
      category: 'caja',
      amount: input.amount,
      tax_rate: 0,
      tax_amount: 0,
      total: input.amount,
      notes: `Retirada manual - Sesión ${input.session_id}`,
      created_by: ctx.userId,
      cash_session_id: input.session_id,
    })

    return success(withdrawal)
  }
)

/** Busca una venta completada por su número de ticket (p. ej. "TICK-2026-0001"). */
export const findSaleByTicketNumber = protectedAction<
  { ticketNumber: string },
  { sale: any } | null
>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { ticketNumber }) => {
    const trimmed = (ticketNumber ?? '').trim()
    if (!trimmed) return success(null)

    const { data: sale } = await ctx.adminClient
      .from('sales')
      .select('*, sale_lines(*), clients(full_name)')
      .eq('ticket_number', trimmed)
      .eq('status', 'completed')
      .maybeSingle()

    return success(sale ? { sale } : null)
  }
)

/** Busca la venta completada más reciente que contiene una línea con el código de barras dado (para devoluciones por escáner/etiqueta). */
export const findSaleByBarcode = protectedAction<
  { barcode: string; storeId?: string },
  { sale: any } | null
>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { barcode, storeId }) => {
    const trimmed = (barcode ?? '').trim()
    if (!trimmed) return success(null)

    // 1) Obtener variant id por código de barras (variantes por talla)
    const { data: variantRow } = await ctx.adminClient
      .from('product_variants')
      .select('id')
      .eq('barcode', trimmed)
      .eq('is_active', true)
      .single()

    let variantId: string | null = variantRow?.id ?? null

    if (!variantId) {
      const { data: productRow } = await ctx.adminClient
        .from('products')
        .select('id')
        .eq('barcode', trimmed)
        .eq('is_active', true)
        .single()
      if (productRow) {
        const { data: firstVariant } = await ctx.adminClient
          .from('product_variants')
          .select('id')
          .eq('product_id', productRow.id)
          .eq('is_active', true)
          .limit(1)
          .single()
        variantId = firstVariant?.id ?? null
      }
    }

    if (!variantId) return success(null)

    // 2) Buscar líneas de venta con esa variante (traer venta para filtrar completadas y ordenar)
    const { data: linesWithSale } = await ctx.adminClient
      .from('sale_lines')
      .select('sale_id, sales!inner(created_at, status)')
      .eq('product_variant_id', variantId)

    if (!linesWithSale?.length) return success(null)

    type LineWithSale = { sale_id: string; sales: { created_at: string; status: string }[] | { created_at: string; status: string } }
    const completed = (linesWithSale as LineWithSale[])
      .filter((row) => {
        const s = Array.isArray(row.sales) ? row.sales[0] : row.sales
        return s?.status === 'completed'
      })
    if (!completed.length) return success(null)

    // Quedarnos con la venta más reciente (por created_at)
    const ordered = [...completed].sort(
      (a, b) => {
        const sa = Array.isArray(a.sales) ? a.sales[0] : a.sales
        const sb = Array.isArray(b.sales) ? b.sales[0] : b.sales
        return new Date(sb?.created_at ?? 0).getTime() - new Date(sa?.created_at ?? 0).getTime()
      }
    )
    const saleId = ordered[0].sale_id

    // 3) Devolver la venta completa con líneas y cliente
    const { data: sale } = await ctx.adminClient
      .from('sales')
      .select('*, sale_lines(*), clients(full_name)')
      .eq('id', saleId)
      .single()

    return success(sale ? { sale } : null)
  }
)

export const createReturn = protectedAction<{
  original_sale_id: string; return_type: 'exchange' | 'voucher'
  line_ids: string[]; reason: string; store_id: string
}, any>(
  {
    permission: 'pos.sell',
    auditModule: 'pos',
    auditAction: 'refund',
    auditEntity: 'return',
    revalidate: ['/pos'],
  },
  async (ctx, input) => {
    const { data: result, error: rpcError } = await ctx.adminClient.rpc('rpc_create_return', {
      p_original_sale_id: input.original_sale_id,
      p_return_type: input.return_type,
      p_line_ids: input.line_ids,
      p_reason: input.reason,
      p_store_id: input.store_id,
      p_user_id: ctx.userId,
    })

    if (rpcError) return failure(rpcError.message)

    return success({
      ...result,
      voucher_code: result.voucher_code ?? null,
    })
  }
)

export const searchProductsForPos = protectedAction<{
  query: string; storeId: string
}, any[]>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { query, storeId }) => {
    const q = (query || '').trim()
    if (!q) return success([])
    if (!storeId) return success([])

    const { data: warehouse } = await ctx.adminClient
      .from('warehouses').select('id')
      .eq('store_id', storeId).eq('is_main', true).single()

    if (!warehouse) return success([])

    // Intentar RPC primero (más eficiente), fallback a query directa
    const { data: rpcData, error: rpcError } = await ctx.adminClient.rpc('search_pos_products', {
      p_query: q, p_warehouse_id: warehouse.id, p_limit: 20,
    })

    if (!rpcError && Array.isArray(rpcData) && rpcData.length >= 0) {
      return success(rpcData)
    }

    // Fallback: búsqueda directa con queries de Supabase
    const pattern = `%${q}%`
    const { data: variants, error } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, size, color, barcode, price_override, is_active,
        products!inner (id, sku, name, base_price, price_with_tax, tax_rate, main_image_url, product_type, brand, cost_price),
        stock_levels!inner (quantity, available, warehouse_id)
      `)
      .eq('is_active', true)
      .eq('stock_levels.warehouse_id', warehouse.id)
      .or(`variant_sku.ilike.${pattern},barcode.ilike.${pattern},products.name.ilike.${pattern},products.sku.ilike.${pattern},products.brand.ilike.${pattern}`)
      .limit(20)

    if (error) {
      console.error('[searchProductsForPos] fallback error:', error.message)
      return success([])
    }

    // Transformar al formato esperado por el frontend
    const results = (variants || []).map((v: any) => ({
      id: v.id,
      variant_sku: v.variant_sku,
      size: v.size,
      color: v.color,
      barcode: v.barcode,
      price_override: v.price_override,
      is_active: v.is_active,
      products: v.products,
      stock_levels: v.stock_levels,
    }))
    return success(results)
  }
)

export const checkCashSessionOpen = protectedAction<
  { storeId?: string },
  { open: boolean; sessionId: string | null }
>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { storeId }) => {
    let query = ctx.adminClient
      .from('cash_sessions')
      .select('id')
      .eq('status', 'open')
      .limit(1)
    if (storeId) query = query.eq('store_id', storeId)
    const { data } = await query.maybeSingle()
    return success({ open: !!data, sessionId: data?.id ?? null })
  }
)

export const validateVoucher = protectedAction<string, any>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, code) => {
    const { data: voucher } = await ctx.adminClient
      .from('vouchers')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('status', 'active')
      .single()

    if (!voucher) return failure('Vale no encontrado o no activo')
    if (new Date(voucher.expiry_date) < new Date()) return failure('Vale expirado')
    return success(voucher)
  }
)

/** Valida un código de descuento (discount_codes) desde el POS */
export const validateDiscountCode = protectedAction<
  { code: string; subtotal?: number },
  { code: string; discount_type: string; discount_value: number; discount_amount: number; description: string | null }
>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { code, subtotal = 0 }) => {
    const { data: dc } = await ctx.adminClient
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single()

    if (!dc) return failure('Código de descuento no válido')

    const now = new Date().toISOString().split('T')[0]
    if (dc.valid_from && now < dc.valid_from) return failure('Este código aún no es válido')
    if (dc.valid_until && now > dc.valid_until) return failure('Este código ha expirado')
    if (dc.max_uses && dc.current_uses >= dc.max_uses) return failure('Código agotado')
    if (dc.min_purchase && subtotal < parseFloat(dc.min_purchase)) {
      return failure(`Compra mínima de ${parseFloat(dc.min_purchase).toFixed(2)}€`)
    }

    let discountAmount = 0
    if (dc.discount_type === 'percentage') {
      discountAmount = Math.round(subtotal * (parseFloat(dc.discount_value) / 100) * 100) / 100
    } else {
      discountAmount = Math.min(parseFloat(dc.discount_value), subtotal)
    }

    return success({
      code: dc.code,
      discount_type: dc.discount_type || 'percentage',
      discount_value: parseFloat(dc.discount_value),
      discount_amount: discountAmount,
      description: dc.description,
    })
  }
)
