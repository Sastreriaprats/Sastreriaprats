import { createAdminClient } from '@/lib/supabase/admin'

async function getNextDeliveryNoteNumber(admin: any): Promise<string> {
  try {
    const { data, error } = await admin.rpc('generate_delivery_note_number')
    if (!error && typeof data === 'string' && data.trim()) return data
  } catch {
    // fallback
  }
  const year = new Date().getFullYear()
  const { data: rows } = await admin
    .from('delivery_notes')
    .select('number')
    .like('number', `ALB-${year}-%`)
    .order('number', { ascending: false })
    .limit(1)
  let next = 1
  const last = rows?.[0]?.number as string | undefined
  if (last) {
    const seq = Number(last.split('-').at(-1))
    if (!Number.isNaN(seq)) next = seq + 1
  }
  return `ALB-${year}-${String(next).padStart(4, '0')}`
}

async function run() {
  const admin = createAdminClient()
  const doneStatuses = ['approved', 'in_transit', 'received']

  const { data: transfers, error } = await admin
    .from('stock_transfers')
    .select(`
      id, transfer_number, status, from_warehouse_id, to_warehouse_id, notes, warehouses!from_warehouse_id(store_id)
    `)
    .in('status', doneStatuses)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[backfill] error cargando traspasos:', error.message)
    process.exit(1)
  }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const t of transfers || []) {
    const transferId = (t as any).id as string

    const { data: existing } = await admin
      .from('delivery_notes')
      .select('id, status')
      .eq('stock_transfer_id', transferId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      const { error: updErr } = await admin
        .from('delivery_notes')
        .update({
          status: 'confirmado',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (updErr) {
        console.error(`[backfill] error actualizando ${existing.id}:`, updErr.message)
      } else {
        updated++
      }
      continue
    }

    const number = await getNextDeliveryNoteNumber(admin)
    const { data: note, error: noteErr } = await admin
      .from('delivery_notes')
      .insert({
        store_id: (t as any)?.warehouses?.store_id || null,
        number,
        type: 'traspaso',
        status: 'confirmado',
        from_warehouse_id: (t as any).from_warehouse_id,
        to_warehouse_id: (t as any).to_warehouse_id,
        stock_transfer_id: transferId,
        notes: (t as any).notes || `Backfill desde traspaso ${(t as any).transfer_number}`,
        confirmed_at: new Date().toISOString(),
        created_by: null,
      })
      .select('id')
      .single()

    if (noteErr || !note?.id) {
      console.error(`[backfill] error creando albarán para ${transferId}:`, noteErr?.message || 'sin detalle')
      continue
    }

    const { data: lines } = await admin
      .from('stock_transfer_lines')
      .select(`
        product_variant_id, quantity_requested, quantity_sent,
        product_variants(variant_sku, products(name, sku, base_price), price_override)
      `)
      .eq('transfer_id', transferId)

    const payload = (lines || [])
      .map((l: any, idx: number) => ({
        delivery_note_id: note.id,
        product_variant_id: l.product_variant_id,
        product_name: l.product_variants?.products?.name ?? null,
        sku: l.product_variants?.variant_sku ?? l.product_variants?.products?.sku ?? null,
        quantity: Number(l.quantity_sent) > 0 ? Number(l.quantity_sent) : Number(l.quantity_requested || 0),
        unit_price: l.product_variants?.price_override != null
          ? Number(l.product_variants.price_override)
          : Number(l.product_variants?.products?.base_price || 0),
        sort_order: idx,
      }))
      .filter((x: any) => x.quantity > 0)

    if (payload.length > 0) {
      const { error: linesErr } = await admin.from('delivery_note_lines').insert(payload)
      if (linesErr) {
        console.error(`[backfill] error líneas para ${note.id}:`, linesErr.message)
      }
    } else {
      skipped++
    }

    created++
  }

  console.log(`[backfill] OK. creados=${created}, actualizados=${updated}, sin_lineas=${skipped}`)
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[backfill] fatal:', e)
    process.exit(1)
  })

