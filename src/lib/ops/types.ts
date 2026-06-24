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

export type MovementRow = {
  saleId?: string         // vacío en cobros manuales (sin PDF)
  date: string
  ref: string             // nº ticket (CLP) o "Manual"
  concept: string
  method: string
  base: number
  vat: number
  total: number
}

// Movimiento contable comprensivo de C (ingresos y gastos)
export type LedgerMovement = {
  date: string
  type: string            // 'Ticket' | 'Compra' | 'Gasto'
  concept: string
  base: number
  vat: number
  total: number           // con signo: + ingreso, − gasto
  saleId?: string
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

export type ViewB = {
  view: AccountingView          // contabilidad de los cobros 100% efectivo (tickets)
  movements: MovementRow[]      // todos los cobros en efectivo (tickets)
  entries: CashEntry[]          // movimientos manuales de control (cobros/pagos)
  manual: ManualSummary         // totales de los movimientos manuales
}

export type InvoiceLite = {
  number: string
  client: string
  date: string
  total: number
  status: string
  method: string
}

export type ViewC = {
  A: AccountingView             // referencia (real, íntegra)
  C: AccountingView             // A menos el efectivo
  ledger: LedgerMovement[]      // TODOS los movimientos (ingresos no-efectivo + gastos)
  invoices: InvoiceLite[]       // facturas emitidas del año
}
