// Tipos compartidos del módulo interno (sin 'use server', solo tipos).

// --- Pago en efectivo de control (proveedor, nómina…). Cifrado en aux.entries.
//     Es informativo: NO afecta a la contabilidad A ni a la C.
export type CashPaymentPayload = {
  date: string            // YYYY-MM-DD
  concept: string
  category: string        // 'proveedor' | 'nomina' | 'alquiler' | 'otro'
  base: number
  vat: number
  amount: number
}
export type CashPayment = CashPaymentPayload & { id: string }

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
  date: string
  ref: string             // nº ticket
  concept: string
  method: string
  base: number
  vat: number
  total: number
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

export type ViewB = {
  view: AccountingView          // contabilidad de los cobros 100% efectivo
  movements: MovementRow[]      // todos los cobros en efectivo (tickets)
  payments: CashPayment[]       // pagos en efectivo de control (manual)
  paymentsTotal: number
}

export type ViewC = {
  A: AccountingView             // referencia (real, íntegra)
  C: AccountingView             // A menos el efectivo
  movements: MovementRow[]      // cobros NO efectivo
}
