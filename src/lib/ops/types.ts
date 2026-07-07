// Tipos compartidos del módulo interno (sin 'use server', solo tipos).

// --- Movimiento manual en efectivo (cobro o pago) de control. Cifrado en
//     aux.entries. Es informativo: NO afecta a la contabilidad A ni a la C.
export type CashEntryPayload = {
  date: string            // YYYY-MM-DD
  concept: string
  category: string        // proveedor / nomina / alquiler / venta / otro…
  direction: 'in' | 'out' // cobro / pago
  ivaRate: number         // 0 | 10 | 18 | 21
  base: number            // importe neto
  vat: number
  amount: number          // base + vat
}
export type CashEntry = CashEntryPayload & { id: string }

// --- Contabilidad (espejo de la A) para una vista (B = efectivo, C = A−efectivo)
export type MonthPoint = { month: string; income: number; expenses: number }

export type QuarterRow = {
  quarter: string         // 'T1'..'T4'
  period: string          // '01/2026 – 03/2026'
  baseSales: number
  ivaRepercutido: number
  basePurchases: number
  ivaSoportado: number
  resultado: number       // ivaRepercutido − ivaSoportado
  salesCount: number
  purchasesCount: number
}

// Tipo de origen de un cobro en efectivo (para depósitos bancarios y PDF)
export type MovementKind = 'sale' | 'order_payment' | 'invoice' | 'manual'

export type MovementRow = {
  kind: MovementKind
  saleId?: string         // venta TPV → PDF de ticket
  orderId?: string        // pedido de sastrería → PDF de ticket de pedido
  paymentId?: string      // id del cobro de sastrería (item de depósito)
  invoiceId?: string      // id de la factura (item de depósito)
  pdfUrl?: string         // PDF ya generado (facturas)
  date: string
  ref: string             // nº ticket (CLP) o "Manual"
  concept: string
  method: string
  client?: string         // nombre del cliente
  base: number
  vat: number
  total: number
}

// Movimiento contable comprensivo de C (ingresos y gastos)
export type LedgerMovement = {
  date: string
  type: string            // 'Ticket' | 'Compra' | 'Gasto'
  concept: string
  client?: string         // cliente (ingresos) o proveedor (gastos)
  base: number
  vat: number
  total: number           // con signo: + ingreso, − gasto
  saleId?: string
  orderId?: string        // pedido de sastrería → PDF de ticket de pedido
  pdfUrl?: string         // PDF ya generado (facturas)
  apPath?: string         // adjunto de factura recibida (bucket supplier-invoices)
}

export type AccountingView = {
  income: number
  expenses: number
  profit: number
  ivaRepercutido: number
  ivaSoportado: number
  vatToPay: number
  monthly: MonthPoint[]
  quarters: QuarterRow[]
  salesCount: number
}

export type ManualSummary = {
  inBase: number; inVat: number; inTotal: number    // cobros manuales
  outBase: number; outVat: number; outTotal: number // pagos manuales
}

// --- Depósito bancario de efectivo: mueve cobros concretos de B a C.
//     Contenido cifrado en aux.deposits / aux.deposit_items.
export type DepositItemPayload = {
  kind: Exclude<MovementKind, 'manual'>
  itemId: string          // sale_id | tailoring_order_payments.id | invoices.id
  amount: number          // parte en efectivo del cobro (IVA incluido)
  ref: string             // nº ticket / pedido / factura
  client?: string
  date: string            // fecha original del cobro (YYYY-MM-DD)
}
export type DepositPayload = { date: string; note: string }
export type DepositRow = DepositPayload & {
  id: string
  createdAt: string
  total: number
  items: (DepositItemPayload & { id: string })[]
}

export type ViewB = {
  view: AccountingView          // contabilidad de los cobros 100% efectivo (tickets)
  movements: MovementRow[]      // todos los cobros en efectivo (tickets)
  entries: CashEntry[]          // movimientos manuales de control (cobros/pagos)
  manual: ManualSummary         // totales de los movimientos manuales
  deposits: DepositRow[]        // ingresos de efectivo al banco (histórico completo)
  depositedTotal: number        // cobros del AÑO ya ingresados al banco (fuera de B)
  depositedCount: number
}

export type InvoiceLite = {
  number: string
  client: string
  date: string
  total: number
  status: string
  method: string
  saleId?: string               // factura de un ticket → dedup en C
  orderId?: string              // factura de un pedido de sastrería → dedup en C
  pdfUrl?: string
}

// Factura recibida de proveedor (gastos del escenario C)
export type ApInvoiceLite = {
  number: string
  supplier: string
  date: string
  base: number
  vat: number
  total: number
  attachmentPath?: string       // path en el bucket supplier-invoices (PDF adjunto)
}

export type ViewC = {
  // OJO: la capa A (real, íntegra) NO viaja al cliente a propósito: este panel
  // lo ve el asesor externo y solo debe conocer el escenario C.
  C: AccountingView             // A menos el efectivo
  ledger: LedgerMovement[]      // TODOS los movimientos (ingresos no-efectivo + gastos)
  invoices: InvoiceLite[]       // facturas emitidas del año
  apInvoices: ApInvoiceLite[]   // facturas recibidas de proveedor del año
}
