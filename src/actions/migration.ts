'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

// ==========================================
// IMPORT CLIENTS
// ==========================================

export const importClients = protectedAction<
  { rows: Record<string, string>[]; mapping: Record<string, string>; dedup_field: string },
  { imported: number; updated: number; skipped: number; errors: { row: number; error: string }[]; batchId: string }
>(
  { permission: 'migration.access', auditModule: 'migration', auditAction: 'import' },
  async (ctx, { rows, mapping, dedup_field }) => {
    const results = { imported: 0, updated: 0, skipped: 0, errors: [] as { row: number; error: string }[] }
    const batchId = `MIG-CLI-${Date.now()}`

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const mapped = mapRow(row, mapping)

        if (!mapped.first_name && !mapped.full_name) {
          results.errors.push({ row: i + 1, error: 'Nombre obligatorio' })
          results.skipped++
          continue
        }

        if (!mapped.first_name && mapped.full_name) {
          const parts = mapped.full_name.trim().split(/\s+/)
          mapped.first_name = parts[0]
          mapped.last_name = parts.slice(1).join(' ')
        }

        if (mapped.email) mapped.email = mapped.email.trim().toLowerCase()
        if (mapped.phone) mapped.phone = cleanPhone(mapped.phone)

        let existingId: string | null = null
        if (dedup_field === 'email' && mapped.email) {
          const { data } = await ctx.adminClient.from('clients').select('id').eq('email', mapped.email).maybeSingle()
          existingId = data?.id || null
        } else if (dedup_field === 'phone' && mapped.phone) {
          const { data } = await ctx.adminClient.from('clients').select('id').eq('phone', mapped.phone).maybeSingle()
          existingId = data?.id || null
        }

        const clientCode = mapped.client_code || `MIG-${(i + 1).toString().padStart(5, '0')}`

        // full_name is GENERATED ALWAYS in the DB — only insert first_name + last_name
        const clientData: Record<string, unknown> = {
          client_code: clientCode,
          first_name: mapped.first_name || '',
          last_name: mapped.last_name || '',
          email: mapped.email || null,
          phone: mapped.phone || null,
          phone_secondary: mapped.phone_secondary || null,
          address: mapped.address || null,
          city: mapped.city || null,
          postal_code: mapped.postal_code || null,
          province: mapped.province || null,
          country: mapped.country || 'España',
          internal_notes: mapped.notes || null,
          category: mapped.category || 'standard',
          source: 'migration',
          migration_batch: batchId,
          migration_original_id: mapped.original_id || null,
          is_active: true,
        }

        if (existingId) {
          const { error } = await ctx.adminClient.from('clients').update(clientData).eq('id', existingId)
          if (error) throw error
          results.updated++
        } else {
          const { error } = await ctx.adminClient.from('clients').insert(clientData)
          if (error) throw error
          results.imported++
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        results.errors.push({ row: i + 1, error: msg })
        results.skipped++
      }
    }

    await ctx.adminClient.from('migration_logs').insert({
      batch_id: batchId,
      entity_type: 'clients',
      total_rows: rows.length,
      imported: results.imported,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors,
      created_by: ctx.userId,
    })

    return success({ ...results, batchId })
  }
)

// ==========================================
// IMPORT PRODUCTS
// ==========================================

export const importProducts = protectedAction<
  { rows: Record<string, string>[]; mapping: Record<string, string>; store_id: string },
  { imported: number; updated: number; skipped: number; errors: { row: number; error: string }[]; batchId: string }
>(
  { permission: 'migration.access', auditModule: 'migration', auditAction: 'import' },
  async (ctx, { rows, mapping, store_id }) => {
    const results = { imported: 0, updated: 0, skipped: 0, errors: [] as { row: number; error: string }[] }
    const batchId = `MIG-PRD-${Date.now()}`

    const { data: warehouse } = await ctx.adminClient
      .from('warehouses').select('id').eq('store_id', store_id).eq('is_main', true).maybeSingle()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const mapped = mapRow(row, mapping)

        if (!mapped.name) {
          results.errors.push({ row: i + 1, error: 'Nombre obligatorio' })
          results.skipped++
          continue
        }

        let existingProductId: string | null = null
        const variantSku = mapped.sku || `MIG-${(i + 1).toString().padStart(5, '0')}`

        if (mapped.sku) {
          const { data: existingVar } = await ctx.adminClient
            .from('product_variants').select('product_id').eq('variant_sku', mapped.sku).maybeSingle()
          existingProductId = existingVar?.product_id || null
        }

        const slug = generateSlug(mapped.name)
        const price = parseFloat(mapped.price) || 0
        const cost = parseFloat(mapped.cost_price) || 0
        const productSku = mapped.sku || variantSku

        const productData: Record<string, unknown> = {
          sku: productSku,
          name: mapped.name,
          web_slug: slug + '-' + i,
          description: mapped.description || null,
          base_price: price,
          cost_price: cost || null,
          brand: mapped.brand || null,
          material: mapped.material || null,
          collection: mapped.collection || null,
          product_type: mapped.product_type || 'boutique',
          is_active: true,
          is_visible_web: mapped.is_visible_web !== 'false',
          main_image_url: mapped.image_url || null,
          migration_batch: batchId,
          migration_original_id: mapped.original_id || null,
        }

        let productId: string

        if (existingProductId) {
          const { sku: _s, web_slug: _w, ...updateData } = productData
          await ctx.adminClient.from('products').update(updateData).eq('id', existingProductId)
          productId = existingProductId
          results.updated++
        } else {
          const { data: newProduct, error } = await ctx.adminClient
            .from('products').insert(productData).select('id').single()
          if (error) throw error
          productId = newProduct.id
          results.imported++
        }

        const { data: existingVariant } = await ctx.adminClient
          .from('product_variants').select('id').eq('variant_sku', variantSku).maybeSingle()

        const variantData: Record<string, unknown> = {
          product_id: productId,
          variant_sku: variantSku,
          barcode: mapped.barcode || null,
          size: mapped.size || null,
          color: mapped.color || null,
          color_hex: mapped.color_hex || null,
          price_override: mapped.variant_price ? parseFloat(mapped.variant_price) : null,
          is_active: true,
        }

        let variantId: string

        if (existingVariant) {
          await ctx.adminClient.from('product_variants').update(variantData).eq('id', existingVariant.id)
          variantId = existingVariant.id
        } else {
          const { data: newVariant, error } = await ctx.adminClient
            .from('product_variants').insert(variantData).select('id').single()
          if (error) throw error
          variantId = newVariant.id
        }

        const stock = parseInt(mapped.stock) || 0
        if (stock > 0 && warehouse) {
          await ctx.adminClient.from('stock_levels').upsert({
            variant_id: variantId,
            warehouse_id: warehouse.id,
            quantity: stock,
            available: stock,
          }, { onConflict: 'variant_id,warehouse_id' })
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        results.errors.push({ row: i + 1, error: msg })
        results.skipped++
      }
    }

    await ctx.adminClient.from('migration_logs').insert({
      batch_id: batchId, entity_type: 'products',
      total_rows: rows.length, imported: results.imported,
      updated: results.updated, skipped: results.skipped,
      errors: results.errors, created_by: ctx.userId,
    })

    return success({ ...results, batchId })
  }
)

// ==========================================
// IMPORT ORDERS (historical)
// ==========================================

export const importOrders = protectedAction<
  { rows: Record<string, string>[]; mapping: Record<string, string>; store_id: string },
  { imported: number; skipped: number; errors: { row: number; error: string }[]; batchId: string }
>(
  { permission: 'migration.access', auditModule: 'migration', auditAction: 'import' },
  async (ctx, { rows, mapping, store_id }) => {
    const results = { imported: 0, skipped: 0, errors: [] as { row: number; error: string }[] }
    const batchId = `MIG-ORD-${Date.now()}`

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const mapped = mapRow(row, mapping)

        let clientId: string | null = null
        if (mapped.client_email) {
          const { data } = await ctx.adminClient
            .from('clients').select('id').eq('email', mapped.client_email.trim().toLowerCase()).maybeSingle()
          clientId = data?.id || null
        } else if (mapped.client_name) {
          const { data } = await ctx.adminClient
            .from('clients').select('id').ilike('full_name', `%${mapped.client_name}%`).limit(1).maybeSingle()
          clientId = data?.id || null
        }

        if (!clientId) {
          results.errors.push({ row: i + 1, error: 'Cliente no encontrado' })
          results.skipped++
          continue
        }

        const orderNumber = mapped.order_number || `MIG-${(i + 1).toString().padStart(5, '0')}`
        const total = parseFloat(mapped.total) || 0
        const orderDate = mapped.order_date || new Date().toISOString().split('T')[0]

        const orderData: Record<string, unknown> = {
          order_number: orderNumber,
          client_id: clientId,
          store_id,
          status: mapped.status || 'delivered',
          order_type: mapped.order_type || 'bespoke',
          total,
          deposit_amount: parseFloat(mapped.deposit) || 0,
          order_date: orderDate,
          estimated_delivery_date: mapped.delivery_date || null,
          internal_notes: mapped.notes || null,
          migration_batch: batchId,
          migration_original_id: mapped.original_id || null,
          created_by: ctx.userId,
        }

        const { error } = await ctx.adminClient.from('tailoring_orders').insert(orderData)
        if (error) throw error
        results.imported++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        results.errors.push({ row: i + 1, error: msg })
        results.skipped++
      }
    }

    await ctx.adminClient.from('migration_logs').insert({
      batch_id: batchId, entity_type: 'orders',
      total_rows: rows.length, imported: results.imported,
      updated: 0, skipped: results.skipped,
      errors: results.errors, created_by: ctx.userId,
    })

    return success({ ...results, batchId })
  }
)

// ==========================================
// IMPORT MEASUREMENTS
// ==========================================

export const importMeasurements = protectedAction<
  { rows: Record<string, string>[]; mapping: Record<string, string> },
  { imported: number; skipped: number; errors: { row: number; error: string }[]; batchId: string }
>(
  { permission: 'migration.access', auditModule: 'migration', auditAction: 'import' },
  async (ctx, { rows, mapping }) => {
    const results = { imported: 0, skipped: 0, errors: [] as { row: number; error: string }[] }
    const batchId = `MIG-MES-${Date.now()}`

    const clientFields = new Set(['client_email', 'client_name', 'client_code', 'garment_type', 'measured_at'])

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const mapped = mapRow(row, mapping)

        let clientId: string | null = null
        if (mapped.client_email) {
          const { data } = await ctx.adminClient
            .from('clients').select('id').eq('email', mapped.client_email.trim().toLowerCase()).maybeSingle()
          clientId = data?.id || null
        } else if (mapped.client_code) {
          const { data } = await ctx.adminClient
            .from('clients').select('id').eq('client_code', mapped.client_code).maybeSingle()
          clientId = data?.id || null
        }

        if (!clientId) {
          results.errors.push({ row: i + 1, error: 'Cliente no encontrado' })
          results.skipped++
          continue
        }

        let garmentTypeId: string | null = null
        if (mapped.garment_type) {
          const { data } = await ctx.adminClient
            .from('garment_types').select('id').ilike('name', `%${mapped.garment_type}%`).maybeSingle()
          garmentTypeId = data?.id || null
        }

        if (!garmentTypeId) {
          // Try to get the first garment type as fallback
          const { data } = await ctx.adminClient
            .from('garment_types').select('id').limit(1).maybeSingle()
          garmentTypeId = data?.id || null
        }

        if (!garmentTypeId) {
          results.errors.push({ row: i + 1, error: 'Tipo de prenda no encontrado' })
          results.skipped++
          continue
        }

        // Extract measurement values (everything not a client/meta field)
        const values: Record<string, number> = {}
        for (const [key, value] of Object.entries(mapped)) {
          if (!clientFields.has(key) && value) {
            const numVal = parseFloat(value)
            if (!isNaN(numVal)) values[key] = numVal
          }
        }

        const { error } = await ctx.adminClient.from('client_measurements').insert({
          client_id: clientId,
          garment_type_id: garmentTypeId,
          measurement_type: 'body',
          values,
          taken_at: mapped.measured_at || new Date().toISOString(),
          taken_by: ctx.userId,
          migration_batch: batchId,
        })
        if (error) throw error

        results.imported++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        results.errors.push({ row: i + 1, error: msg })
        results.skipped++
      }
    }

    await ctx.adminClient.from('migration_logs').insert({
      batch_id: batchId, entity_type: 'measurements',
      total_rows: rows.length, imported: results.imported,
      updated: 0, skipped: results.skipped,
      errors: results.errors, created_by: ctx.userId,
    })

    return success({ ...results, batchId })
  }
)

// ==========================================
// ROLLBACK
// ==========================================

export const rollbackMigration = protectedAction<
  string,
  { deleted: number; entity_type: string }
>(
  { permission: 'migration.access', auditModule: 'migration', auditAction: 'delete' },
  async (ctx, batchId) => {
    const { data: log } = await ctx.adminClient
      .from('migration_logs').select('entity_type, rolled_back').eq('batch_id', batchId).single()
    if (!log) return failure('Batch no encontrado')
    if (log.rolled_back) return failure('Este batch ya fue revertido')

    let deleted = 0

    if (log.entity_type === 'clients') {
      const { count } = await ctx.adminClient
        .from('clients').delete({ count: 'exact' }).eq('migration_batch', batchId)
      deleted = count || 0
    } else if (log.entity_type === 'products') {
      const { data: products } = await ctx.adminClient
        .from('products').select('id').eq('migration_batch', batchId)
      for (const p of products || []) {
        const { data: variants } = await ctx.adminClient
          .from('product_variants').select('id').eq('product_id', p.id)
        const variantIds = variants?.map(v => v.id) || []
        if (variantIds.length > 0) {
          await ctx.adminClient.from('stock_levels').delete().in('variant_id', variantIds)
        }
        await ctx.adminClient.from('product_variants').delete().eq('product_id', p.id)
      }
      const { count } = await ctx.adminClient
        .from('products').delete({ count: 'exact' }).eq('migration_batch', batchId)
      deleted = count || 0
    } else if (log.entity_type === 'orders') {
      const { count } = await ctx.adminClient
        .from('tailoring_orders').delete({ count: 'exact' }).eq('migration_batch', batchId)
      deleted = count || 0
    } else if (log.entity_type === 'measurements') {
      const { count } = await ctx.adminClient
        .from('client_measurements').delete({ count: 'exact' }).eq('migration_batch', batchId)
      deleted = count || 0
    }

    await ctx.adminClient.from('migration_logs').update({
      rolled_back: true,
      rolled_back_at: new Date().toISOString(),
    }).eq('batch_id', batchId)

    return success({ deleted, entity_type: log.entity_type })
  }
)

// ==========================================
// MIGRATION LOGS
// ==========================================

export const getMigrationLogs = protectedAction<
  void,
  Record<string, unknown>[]
>(
  { permission: 'migration.access', auditModule: 'migration' },
  async (ctx) => {
    const { data } = await ctx.adminClient
      .from('migration_logs')
      .select('*, profiles:created_by(full_name)')
      .order('created_at', { ascending: false })
    return success(data || [])
  }
)

// ==========================================
// HELPERS
// ==========================================

function mapRow(row: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [sourceCol, targetField] of Object.entries(mapping)) {
    if (targetField && row[sourceCol] !== undefined && row[sourceCol] !== null && row[sourceCol] !== '') {
      result[targetField] = String(row[sourceCol]).trim()
    }
  }
  return result
}

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '')
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
