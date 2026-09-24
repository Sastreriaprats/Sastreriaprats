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

// Mismo desglose que QuarterRow pero por mes ('2026-01'…'2026-12').
export type VatMonthRow = Omit<QuarterRow, 'quarter' | 'period'> & { month: string }

// Tipo de origen de un cobro en efectivo (para depósitos bancarios y PDF)
export type MovementKind = 'sale' | 'order_payment' | 'reservation_payment' | 'invoice' | 'manual'

export type MovementRow = {
  kind: MovementKind
  saleId?: string         // venta TPV → PDF de ticket
  orderId?: string        // pedido de sastrería → PDF de ticket de pedido
  orderPaymentId?: string // cobro de sastrería con ticket CLP-P (mig 291) → PDF de ese cobro
  reservationPaymentId?: string // cobro de reserva con ticket CLP-R (mig 292) → PDF de ese cobro
  paymentId?: string      // id del cobro de sastrería o de la señal de reserva (item de depósito)
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
  invoiceId?: string      // factura emitida (venta o abono) → dedup con el listado
  orderId?: string        // pedido de sastrería → PDF de ticket de pedido
  orderPaymentId?: string // cobro de sastrería con ticket CLP-P (mig 291) → PDF de ese cobro
  reservationPaymentId?: string // cobro de reserva con ticket CLP-R (mig 292) → PDF de ese cobro
  onlineOrderId?: string  // pedido online con ticket (mig 286) → PDF de ticket
  pdfUrl?: string         // PDF ya generado (facturas)
  apPath?: string        // adjunto de factura recibida (bucket supplier-invoices)
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
  monthlyVat: VatMonthRow[]
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
  itemId: string          // sale_id | tailoring_order_payments.id | product_reservation_payments.id | invoices.id
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

// De dónde sale una factura emitida (puede ser más de uno: pedidos + reservas)
export type InvoiceOriginKind = 'ticket' | 'pedido' | 'reserva' | 'web'

export type InvoiceLite = {
  id: string
  number: string
  client: string
  nif?: string                  // NIF del cliente (para el 347)
  date: string
  base: number                  // base imponible (subtotal)
  vat: number                   // cuota de IVA
  total: number
  status: string
  method: string
  saleId?: string               // factura de un ticket → dedup en C
  orderId?: string              // factura de un pedido de sastrería → dedup en C
  origin?: string               // a qué va asociada: "Ticket CLP-…", "Pedidos PIN-… · Reserva RSV-…", "Web WEB-…"
  originKinds: InvoiceOriginKind[] // vacío = factura manual (sin ticket/pedido/reserva/web)
  pdfUrl?: string
  // ¿Cuenta como VENTA del escenario? Desde DOC_RULE_START manda la factura, así
  // que sí; las anteriores ligadas a ticket/pedido/reserva se declararon por sus
  // cobros y figuran como documento informativo (no suman).
  counted: boolean
  collected?: number            // cobrado de esta factura (cobros ligados del año); undefined = sin datos
  pending?: number              // total − cobrado
}

// Factura recibida de proveedor (gastos del escenario C)
export type ApInvoiceLite = {
  id: string
  number: string
  supplier: string
  cif?: string                  // NIF/CIF del proveedor (para 347/349 e intracomunitarias)
  date: string
  base: number
  vat: number
  vatRate: number | null        // tipo de IVA del documento; null = varios tipos en líneas
  retentionRate: number         // % de retención IRPF (15 profesionales, 19 alquileres…)
  retentionAmount: number       // importe retenido (se ingresa a Hacienda, no al proveedor)
  total: number                 // total del documento: base + IVA − retención
  isIntraEU: boolean            // proveedor intracomunitario (CIF-IVA de otro país UE)
  status: string                // 'pagada' | 'pendiente'
  payments: { date: string; amount: number }[] // pagos hechos (sin método: en C no figura)
  attachmentPath?: string       // path en el bucket supplier-invoices (PDF adjunto)
  note?: string                 // nota de la factura (ap_supplier_invoices.notes), visible en C
}

// Desglose del IVA soportado por tipo impositivo. byQuarter[0..3] = T1..T4.
export type VatRateRow = {
  rate: number                  // 21 | 10 | 4 | 0…
  byQuarter: { base: number; vat: number }[]
  byMonth: { base: number; vat: number }[]   // [0..11] = enero..diciembre
  base: number                  // total año
  vat: number
}

export type ViewC = {
  // OJO: la capa A (real, íntegra) NO viaja al cliente a propósito: este panel
  // lo ve el asesor externo y solo debe conocer el escenario C.
  C: AccountingView             // A menos el efectivo
  ledger: LedgerMovement[]      // TODOS los movimientos (ingresos no-efectivo + gastos)
  invoices: InvoiceLite[]       // facturas emitidas del año
  apInvoices: ApInvoiceLite[]   // facturas recibidas de proveedor del año
  vatByRate: VatRateRow[]       // IVA soportado desglosado por tipo impositivo
}
