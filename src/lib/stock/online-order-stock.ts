import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

interface OnlineOrderLineStock {
  variantId: string
  quantity: number
  orderId: string
  orderNumber: string
}

interface StockLevelRow {
  id: string
  quantity: number
  reserved: number
  warehouse_id: string
  warehouses: { store_id: string | null } | null
}

/**
 * Descuenta el stock de una línea de pedido online eligiendo el almacén donde
 * realmente hay stock. Antes se cogía una fila arbitraria (`limit(1)`) y, si
 * ese almacén estaba a 0, el descuento se recortaba en silencio dejando la
 * unidad vendida como disponible en otro almacén (caso WEB-MRKLEIXK).
 *
 * - Prefiere un almacén que cubra toda la cantidad con disponible real
 *   (quantity - reserved), para no comerse unidades reservadas.
 * - Si ninguno la cubre, reparte entre almacenes con stock de mayor a menor.
 * - Si aun así falta, registra el resto recortado ligado al pedido y deja
 *   constancia en client_error_log para que la sobreventa no pase inadvertida.
 */
export async function deductOnlineOrderStock(
  admin: AdminClient,
  line: OnlineOrderLineStock,
): Promise<void> {
  const { data } = await admin
    .from('stock_levels')
    .select('id, quantity, reserved, warehouse_id, warehouses ( store_id )')
    .eq('product_variant_id', line.variantId)
    .order('quantity', { ascending: false })

  const levels = (data || []) as unknown as StockLevelRow[]
  if (!levels.length) {
    await logStockAnomaly(admin, line, 'Variante sin filas en stock_levels: no se pudo descontar stock')
    return
  }

  const covering = levels.find((l) => l.quantity - l.reserved >= line.quantity)
  const queue = covering ? [covering, ...levels.filter((l) => l.id !== covering.id)] : levels

  let remaining = line.quantity
  for (const sl of queue) {
    if (remaining <= 0) break
    if (sl.quantity <= 0) continue
    const take = Math.min(sl.quantity, remaining)
    const newQty = sl.quantity - take
    await admin.from('stock_levels').update({ quantity: newQty }).eq('id', sl.id)
    await insertSaleMovement(admin, line, sl, -take, sl.quantity, newQty)
    remaining -= take
  }

  if (remaining > 0) {
    // Sobreventa real: no queda stock en ningún almacén. Se registra el resto
    // (recortado a 0) para que el movimiento quede ligado a la venta, y se
    // avisa por telemetría en vez de tragarlo en silencio.
    const sl = queue[0]
    await insertSaleMovement(admin, line, sl, -remaining, 0, 0)
    await logStockAnomaly(admin, line, `Sobreventa: faltan ${remaining} uds sin stock en ningún almacén`)
  }
}

async function insertSaleMovement(
  admin: AdminClient,
  line: OnlineOrderLineStock,
  sl: StockLevelRow,
  quantity: number,
  before: number,
  after: number,
): Promise<void> {
  await admin.from('stock_movements').insert({
    product_variant_id: line.variantId,
    warehouse_id: sl.warehouse_id,
    movement_type: 'sale',
    quantity,
    stock_before: before,
    stock_after: after,
    // Enlace al pedido online (mismo patrón que el TPV con 'sale') para
    // que la lista de movimientos resuelva el cliente.
    reference_type: 'online_order',
    reference_id: line.orderId,
    store_id: sl.warehouses?.store_id ?? null,
    reason: `Pedido online ${line.orderNumber}`,
  })
}

async function logStockAnomaly(
  admin: AdminClient,
  line: OnlineOrderLineStock,
  message: string,
): Promise<void> {
  await admin.from('client_error_log').insert({
    source: 'online_order_stock',
    error_message: message,
    context: {
      order_id: line.orderId,
      order_number: line.orderNumber,
      variant_id: line.variantId,
      quantity: line.quantity,
    },
  })
}
