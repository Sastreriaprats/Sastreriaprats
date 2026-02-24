'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { getNextNumber } from '@/lib/server/query-helpers'
import {
  openCashSessionSchema, closeCashSessionSchema,
  createSaleSchema,
} from '@/lib/validations/pos'
import { success, failure } from '@/lib/errors'
import { createSaleJournalEntry } from '@/actions/accounting-triggers'

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
        status: 'open',
      })
      .select()
      .single()

    if (error) return failure(error.message)
    return success(session)
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

    const { data: closed, error } = await ctx.adminClient
      .from('cash_sessions')
      .update({
        closed_by: ctx.userId,
        closed_at: new Date().toISOString(),
        counted_cash: parsed.data.counted_cash,
        expected_cash: expectedCash,
        cash_difference: difference,
        closing_notes: parsed.data.closing_notes || null,
        status: 'closed',
      })
      .eq('id', session.id)
      .select()
      .single()

    if (error) return failure(error.message)
    return success(closed)
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

    const ticketNumber = await getNextNumber('sales', 'ticket_number', 'TK')

    let subtotal = 0
    const processedLines = linesInput.map((line: any) => {
      const lineDiscount = line.unit_price * line.quantity * (line.discount_percentage / 100)
      const taxableAmount = (line.unit_price * line.quantity) - lineDiscount
      const lineTotal = taxableAmount * (1 + line.tax_rate / 100)
      subtotal += line.unit_price * line.quantity - lineDiscount
      return { ...line, discount_amount: lineDiscount, line_total: lineTotal }
    })

    const saleDiscount = subtotal * (parsedSale.data.discount_percentage || 0) / 100
    const taxableTotal = subtotal - saleDiscount
    const taxAmount = taxableTotal * 0.21
    const total = taxableTotal + taxAmount

    const paymentMethods = paymentsInput.map((p: any) => p.payment_method)
    const paymentMethod = paymentMethods.length === 1 ? paymentMethods[0] : 'mixed'

    const { data: sale, error: saleError } = await ctx.adminClient
      .from('sales')
      .insert({
        ...parsedSale.data,
        ticket_number: ticketNumber,
        salesperson_id: ctx.userId,
        subtotal,
        discount_amount: saleDiscount,
        tax_amount: taxAmount,
        total,
        payment_method: paymentMethod,
        status: 'completed',
      })
      .select()
      .single()

    if (saleError) return failure(saleError.message)

    const saleLines = processedLines.map((line: any) => ({ ...line, sale_id: sale.id }))
    await ctx.adminClient.from('sale_lines').insert(saleLines)

    const salePayments = paymentsInput.map((p: any) => ({ ...p, sale_id: sale.id }))
    await ctx.adminClient.from('sale_payments').insert(salePayments)

    // Asiento contable automático por venta completada
    createSaleJournalEntry(sale.id).catch(() => {})

    // Update cash session totals directly
    const { data: currentSession } = await ctx.adminClient
      .from('cash_sessions')
      .select('total_sales, total_cash_sales, total_card_sales, total_bizum_sales, total_transfer_sales, total_voucher_sales')
      .eq('id', parsedSale.data.cash_session_id)
      .single()

    if (currentSession) {
      const updates: Record<string, number> = {
        total_sales: (currentSession.total_sales || 0) + total,
      }
      for (const p of paymentsInput) {
        const field = `total_${p.payment_method}_sales` as string
        if (field in currentSession) {
          updates[field] = ((currentSession as any)[field] || 0) + p.amount
        }
      }
      await ctx.adminClient
        .from('cash_sessions')
        .update(updates)
        .eq('id', parsedSale.data.cash_session_id)
    }

    // Update stock for product variants
    for (const line of linesInput) {
      if (line.product_variant_id) {
        const { data: warehouse } = await ctx.adminClient
          .from('warehouses')
          .select('id')
          .eq('store_id', parsedSale.data.store_id)
          .eq('is_main', true)
          .single()

        if (warehouse) {
          const { data: stock } = await ctx.adminClient
            .from('stock_levels')
            .select('id, quantity')
            .eq('product_variant_id', line.product_variant_id)
            .eq('warehouse_id', warehouse.id)
            .single()

          if (stock) {
            const newQty = Math.max(0, stock.quantity - line.quantity)
            await ctx.adminClient
              .from('stock_levels')
              .update({ quantity: newQty, last_sale_at: new Date().toISOString(), last_movement_at: new Date().toISOString() })
              .eq('id', stock.id)

            await ctx.adminClient.from('stock_movements').insert({
              product_variant_id: line.product_variant_id,
              warehouse_id: warehouse.id,
              movement_type: 'sale',
              quantity: -line.quantity,
              stock_before: stock.quantity,
              stock_after: newQty,
              reference_type: 'sale',
              reference_id: sale.id,
              created_by: ctx.userId,
              store_id: parsedSale.data.store_id,
            })
          }
        }
      }
    }

    return success(sale)
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

    return success(withdrawal)
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
    const { data: originalSale } = await ctx.adminClient
      .from('sales')
      .select('*, sale_lines(*)')
      .eq('id', input.original_sale_id)
      .single()

    if (!originalSale) return failure('Venta original no encontrada')

    const returnLines = originalSale.sale_lines.filter((l: any) => input.line_ids.includes(l.id))
    const totalReturned = returnLines.reduce((sum: number, l: any) => sum + l.line_total, 0)

    let voucherId: string | null = null

    if (input.return_type === 'voucher') {
      const voucherCode = `DEV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

      const { data: voucher, error: vError } = await ctx.adminClient
        .from('vouchers')
        .insert({
          code: voucherCode,
          voucher_type: 'fixed',
          original_amount: totalReturned,
          remaining_amount: totalReturned,
          origin_sale_id: input.original_sale_id,
          client_id: originalSale.client_id,
          issued_date: new Date().toISOString().split('T')[0],
          expiry_date: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
          status: 'active',
          issued_by_store_id: input.store_id,
          issued_by: ctx.userId,
        })
        .select()
        .single()

      if (vError) return failure(vError.message)
      voucherId = voucher.id
    }

    const { data: returnRecord, error } = await ctx.adminClient
      .from('returns')
      .insert({
        original_sale_id: input.original_sale_id,
        return_type: input.return_type,
        total_returned: totalReturned,
        voucher_id: voucherId,
        reason: input.reason,
        processed_by: ctx.userId,
        store_id: input.store_id,
      })
      .select()
      .single()

    if (error) return failure(error.message)

    for (const line of returnLines) {
      await ctx.adminClient
        .from('sale_lines')
        .update({ quantity_returned: line.quantity, returned_at: new Date().toISOString(), return_reason: input.reason })
        .eq('id', line.id)
    }

    const allReturned = originalSale.sale_lines.every((l: any) =>
      input.line_ids.includes(l.id) || l.quantity_returned > 0
    )
    await ctx.adminClient
      .from('sales')
      .update({ status: allReturned ? 'fully_returned' : 'partially_returned' })
      .eq('id', input.original_sale_id)

    // Restore stock
    for (const line of returnLines) {
      if (line.product_variant_id) {
        const { data: warehouse } = await ctx.adminClient
          .from('warehouses').select('id')
          .eq('store_id', input.store_id).eq('is_main', true).single()
        if (warehouse) {
          const { data: stock } = await ctx.adminClient
            .from('stock_levels').select('id, quantity')
            .eq('product_variant_id', line.product_variant_id)
            .eq('warehouse_id', warehouse.id).single()
          if (stock) {
            const newQty = stock.quantity + line.quantity
            await ctx.adminClient.from('stock_levels')
              .update({ quantity: newQty, last_movement_at: new Date().toISOString() })
              .eq('id', stock.id)
            await ctx.adminClient.from('stock_movements').insert({
              product_variant_id: line.product_variant_id, warehouse_id: warehouse.id,
              movement_type: 'return', quantity: line.quantity,
              stock_before: stock.quantity, stock_after: newQty,
              reference_type: 'return', reference_id: returnRecord.id,
              created_by: ctx.userId, store_id: input.store_id,
            })
          }
        }
      }
    }

    let voucherCode: string | null = null
    if (voucherId) {
      const { data: v } = await ctx.adminClient.from('vouchers').select('code').eq('id', voucherId).single()
      voucherCode = v?.code || null
    }

    return success({ ...returnRecord, voucher_code: voucherCode })
  }
)

export const searchProductsForPos = protectedAction<{
  query: string; storeId: string
}, any[]>(
  { permission: 'pos.access', auditModule: 'pos' },
  async (ctx, { query, storeId }) => {
    const { data: warehouse } = await ctx.adminClient
      .from('warehouses').select('id')
      .eq('store_id', storeId).eq('is_main', true).single()

    if (!warehouse) return success([])

    const { data } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, size, color, barcode, price_override, is_active,
        products!inner ( id, sku, name, base_price, price_with_tax, tax_rate, main_image_url, product_type, brand, cost_price ),
        stock_levels!inner ( quantity, available, warehouse_id )
      `)
      .eq('is_active', true)
      .eq('stock_levels.warehouse_id', warehouse.id)
      .or(`variant_sku.ilike.%${query}%,barcode.ilike.%${query}%,products.name.ilike.%${query}%,products.sku.ilike.%${query}%`)
      .limit(20)

    return success(data || [])
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
