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

/**
 * Construye la URL de impresión de etiquetas a partir de lo YA RECIBIDO de un
 * pedido a proveedor, para poder reimprimirlas más tarde.
 *
 * El diálogo de "¿imprimir etiquetas?" solo aparece en el momento de registrar
 * la recepción: si se cierra o se pulsa "Ahora no", no había forma de volver a
 * sacarlas desde el pedido y tocaba buscar variante por variante en Códigos de
 * barras. Esta variante lee `quantity_received` en vez de lo que se acaba de
 * enviar, así que sirve en cualquier momento posterior.
 *
 * Devuelve null si ninguna línea recibida tiene variante de producto (los
 * tejidos y las líneas libres no llevan etiqueta por talla).
 */
export function buildLabelsUrlFromReceivedLines(
  lines: SupplierOrderLineForReceipt[],
): string | null {
  const qtyByVariant = new Map<string, number>()
  for (const line of lines) {
    if (!line.product_variant_id) continue
    const recibidas = Math.round(Number(line.quantity_received) || 0)
    if (recibidas <= 0) continue
    qtyByVariant.set(
      line.product_variant_id,
      (qtyByVariant.get(line.product_variant_id) || 0) + recibidas,
    )
  }
  if (qtyByVariant.size === 0) return null
  const ids = [...qtyByVariant.keys()]
  const qtys = ids.map((id) => qtyByVariant.get(id) as number)
  // Sin `autoprint`: en una reimpresión conviene que se vea antes lo que va a
  // salir, que pueden ser cientos de etiquetas.
  return `/admin/stock/codigos-barras/imprimir?variantIds=${ids.join(',')}&qtys=${qtys.join(',')}`
}
