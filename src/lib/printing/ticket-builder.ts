import { EscPosBuilder } from './escpos'

export interface TicketData {
  store_name: string
  store_address: string
  store_phone: string
  store_cif: string
  ticket_number: string
  date: string
  time: string
  cashier: string
  items: { name: string; qty: number; price: number; total: number }[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  payment_method: string
  amount_paid?: number
  change?: number
  client_name?: string
}

export function buildPosTicket(data: TicketData): Uint8Array {
  const b = new EscPosBuilder()

  b.initialize()

  b.alignCenter()
    .doubleSize().text('PRATS').newLine()
    .normalSize().text('MADRID').newLine(2)
    .text(data.store_name).newLine()
    .text(data.store_address).newLine()
    .text(`Tel: ${data.store_phone}`).newLine()
    .text(`CIF: ${data.store_cif}`).newLine()
    .line('=')

  b.alignLeft()
    .columns('Ticket:', data.ticket_number)
    .columns('Fecha:', `${data.date} ${data.time}`)
    .columns('Cajero:', data.cashier)
  if (data.client_name) b.columns('Cliente:', data.client_name)
  b.line('-')

  b.bold(true)
    .threeColumns('Artículo', 'Cant.', 'Importe')
    .bold(false)
    .line('-')

  for (const item of data.items) {
    b.text(item.name).newLine()
    b.columns(`  ${item.qty} x ${item.price.toFixed(2)}€`, `${item.total.toFixed(2)}€`)
  }
  b.line('-')

  b.columns('Subtotal:', `${data.subtotal.toFixed(2)}€`)
    .columns(`IVA (${data.tax_rate}%):`, `${data.tax_amount.toFixed(2)}€`)
    .line('=')
    .bold(true).doubleHeight()
    .columns('TOTAL:', `${data.total.toFixed(2)}€`)
    .normalSize().bold(false)
    .line('=')

  b.newLine()
  const paymentLabels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', mixed: 'Mixto' }
  b.columns('Forma de pago:', paymentLabels[data.payment_method] || data.payment_method)
  if (data.amount_paid) b.columns('Entregado:', `${data.amount_paid.toFixed(2)}€`)
  if (data.change && data.change > 0) b.columns('Cambio:', `${data.change.toFixed(2)}€`)

  b.newLine()
    .alignCenter()
    .text('¡Gracias por su compra!').newLine()
    .text('www.sastreriaprats.com').newLine(2)

  b.alignCenter()
    .barcode(data.ticket_number.replace(/[^A-Za-z0-9]/g, ''))
    .newLine(2)

  b.feed(4).cut()

  return b.toUint8Array()
}

export interface LabelData {
  product_name: string
  sku: string
  price: number
  size?: string
  color?: string
  barcode: string
}

export function buildProductLabel(data: LabelData): Uint8Array {
  const b = new EscPosBuilder()

  b.initialize()
    .alignCenter()
    .bold(true).text('PRATS').newLine()
    .normalSize().bold(false)
    .newLine()
    .text(data.product_name).newLine()
  if (data.size || data.color) {
    const parts = [data.size, data.color].filter(Boolean).join(' / ')
    b.text(parts).newLine()
  }
  b.text(`SKU: ${data.sku}`).newLine()
    .newLine()
    .doubleSize().bold(true)
    .text(`${data.price.toFixed(2)}€`).newLine()
    .normalSize().bold(false)
    .newLine()
    .barcode(data.barcode)
    .newLine()
    .feed(2).cut()

  return b.toUint8Array()
}
