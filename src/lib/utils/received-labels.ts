import type { SupplierOrderLineForReceipt, ReceiveSupplierOrderLineInput } from '@/actions/suppliers'

/**
 * Construye la URL de impresión de etiquetas/códigos de barras para las líneas
 * de producto recién recibidas de un pedido a proveedor (una etiqueta por unidad).
 * Devuelve null si ninguna línea recibida tiene variante de producto asociada
 * (tejidos y líneas sin variante no llevan etiqueta por talla).
 */
export function buildReceivedLabelsUrl(
  receptionLines: SupplierOrderLineForReceipt[],
  sentLines: ReceiveSupplierOrderLineInput[],
): string | null {
  const qtyByVariant = new Map<string, number>()
  for (const sent of sentLines) {
    if (sent.type !== 'product') continue
    const line = receptionLines.find((l) => l.id === sent.lineId)
    if (!line?.product_variant_id) continue
    const labels = Math.max(1, Math.round(Number(sent.quantityReceived)))
    qtyByVariant.set(line.product_variant_id, (qtyByVariant.get(line.product_variant_id) || 0) + labels)
  }
  if (qtyByVariant.size === 0) return null
  const ids = [...qtyByVariant.keys()]
  const qtys = ids.map((id) => qtyByVariant.get(id) as number)
  return `/admin/stock/codigos-barras/imprimir?variantIds=${ids.join(',')}&qtys=${qtys.join(',')}&autoprint=1`
}
